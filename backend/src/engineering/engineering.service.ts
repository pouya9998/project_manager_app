import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppNotificationType,
  EngineeringEventSource,
  EngineeringEventType,
  ProjectType,
  Role,
  TaskDependencyType,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GitlabService } from '../gitlab/gitlab.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class EngineeringService {
  constructor(
    private prisma: PrismaService,
    private gitlab: GitlabService,
    private notifications: NotificationsService,
  ) {}

  async timeline(taskId: number, user: { id: number; role: Role }) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { assignees: true, project: true },
    });
    if (!task) throw new NotFoundException('وظیفه یافت نشد');
    if (
      user.role !== Role.ADMIN &&
      !task.assignees.some((a) => a.userId === user.id) &&
      task.creatorId !== user.id
    ) {
      throw new ForbiddenException();
    }
    return this.prisma.taskEngineeringEvent.findMany({
      where: { taskId },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
  }

  async listDependencies(taskId: number) {
    return this.prisma.taskDependency.findMany({
      where: { OR: [{ fromTaskId: taskId }, { toTaskId: taskId }] },
      include: {
        fromTask: { select: { id: true, title: true, status: true } },
        toTask: { select: { id: true, title: true, status: true } },
      },
    });
  }

  async addDependency(
    fromTaskId: number,
    toTaskId: number,
    type: TaskDependencyType,
    user: { id: number; role: Role },
  ) {
    if (fromTaskId === toTaskId) {
      throw new BadRequestException('وظیفه نمی‌تواند به خودش وابسته باشد');
    }
    const [from, to] = await Promise.all([
      this.prisma.task.findUnique({ where: { id: fromTaskId }, include: { project: true } }),
      this.prisma.task.findUnique({ where: { id: toTaskId }, include: { project: true } }),
    ]);
    if (!from || !to) throw new NotFoundException('وظیفه یافت نشد');
    if (from.project?.type !== ProjectType.SOFTWARE || to.project?.type !== ProjectType.SOFTWARE) {
      throw new ForbiddenException('وابستگی فقط برای پروژه‌های نرم‌افزاری است');
    }
    if (from.projectId !== to.projectId) {
      throw new BadRequestException('وابستگی فقط داخل یک پروژه مجاز است');
    }

    // cycle detection on BLOCKS graph
    if (await this.wouldCreateCycle(fromTaskId, toTaskId, type)) {
      throw new BadRequestException('این وابستگی باعث ایجاد حلقه می‌شود');
    }

    const dep = await this.prisma.taskDependency.create({
      data: { fromTaskId, toTaskId, type },
      include: {
        fromTask: { select: { id: true, title: true } },
        toTask: { select: { id: true, title: true } },
      },
    });

    await this.gitlab.recordEvent({
      taskId: fromTaskId,
      projectId: from.projectId,
      type: EngineeringEventType.TASK_UPDATED,
      source: EngineeringEventSource.INTERNAL,
      externalId: `dep:${dep.id}`,
      title: `وابستگی ${type}: #${toTaskId}`,
      actorName: String(user.id),
    });

    const blockers = await this.prisma.task.findUnique({
      where: { id: toTaskId },
      include: { assignees: true },
    });
    if (blockers && type === TaskDependencyType.BLOCKS) {
      await this.notifications.notifyUsers(
        blockers.assignees.map((a) => a.userId),
        {
          type: AppNotificationType.TASK_BLOCKED,
          title: 'مسدود شدن وظیفه',
          body: `وظیفه «${blockers.title}» توسط #${fromTaskId} مسدود شد`,
          link: `/tasks/${toTaskId}`,
        },
      );
    }

    return dep;
  }

  async removeDependency(id: number) {
    await this.prisma.taskDependency.delete({ where: { id } });
    return { ok: true };
  }

  private async wouldCreateCycle(
    fromId: number,
    toId: number,
    type: TaskDependencyType,
  ): Promise<boolean> {
    // Normalize: BLOCKS means from blocks to (edge from -> to)
    // BLOCKED_BY means from is blocked by to (edge to -> from)
    const edgeFrom = type === TaskDependencyType.BLOCKS ? fromId : toId;
    const edgeTo = type === TaskDependencyType.BLOCKS ? toId : fromId;

    const visited = new Set<number>();
    const stack = [edgeTo];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === edgeFrom) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const outs = await this.prisma.taskDependency.findMany({
        where: {
          OR: [
            { fromTaskId: cur, type: TaskDependencyType.BLOCKS },
            { toTaskId: cur, type: TaskDependencyType.BLOCKED_BY },
          ],
        },
      });
      for (const d of outs) {
        const next = d.type === TaskDependencyType.BLOCKS ? d.toTaskId : d.fromTaskId;
        stack.push(next);
      }
    }
    return false;
  }

  /**
   * Software engineering dashboard.
   * Formulas:
   * - wip: tasks in IN_PROGRESS + IN_REVIEW on SOFTWARE projects
   * - overdue: dueDate < now and status not DONE/CANCELLED
   * - openMrs / staleMrs: linked MRs state=opened; stale if updatedAtGitlab < now-7d or createdAt < now-7d
   * - pipelineSuccessRate: success / (success+failed) in period
   * - leadTimeDays: avg (first DONE engineering STATUS or task.updatedAt when DONE - createdAt)
   * - cycleTimeDays: avg (MR mergedAt - first COMMIT linked) when both exist
   */
  async softwareDashboard(query: {
    projectId?: number;
    days?: number;
  }) {
    const days = Math.min(Math.max(query.days || 30, 1), 365);
    const since = new Date(Date.now() - days * 86400000);
    const projectFilter: any = {
      type: ProjectType.SOFTWARE,
      isActive: true,
      ...(query.projectId ? { id: query.projectId } : {}),
    };

    const projects = await this.prisma.project.findMany({
      where: projectFilter,
      select: { id: true, name: true },
    });
    const projectIds = projects.map((p) => p.id);

    const taskWhere = { projectId: { in: projectIds } };

    const [wip, overdue, openMrs, allOpenMrs, pipelines, linkedCommits] = await Promise.all([
      this.prisma.task.count({
        where: {
          ...taskWhere,
          status: { in: [TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW] },
        },
      }),
      this.prisma.task.count({
        where: {
          ...taskWhere,
          dueDate: { lt: new Date() },
          status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
        },
      }),
      this.prisma.taskMergeRequest.count({
        where: {
          state: 'opened',
          task: { projectId: { in: projectIds } },
        },
      }),
      this.prisma.taskMergeRequest.findMany({
        where: {
          state: 'opened',
          task: { projectId: { in: projectIds } },
        },
        select: { updatedAtGitlab: true, createdAt: true },
      }),
      this.prisma.gitlabPipeline.findMany({
        where: {
          projectId: { in: projectIds },
          createdAt: { gte: since },
          status: { in: ['success', 'failed'] },
        },
        select: { status: true },
      }),
      this.prisma.taskCommit.findMany({
        where: {
          task: { projectId: { in: projectIds } },
          createdAt: { gte: since },
        },
        select: { taskId: true, committedAt: true, createdAt: true },
      }),
    ]);

    const staleCutoff = new Date(Date.now() - 7 * 86400000);
    const staleMrs = allOpenMrs.filter((m) => {
      const t = m.updatedAtGitlab || m.createdAt;
      return t < staleCutoff;
    }).length;

    const success = pipelines.filter((p) => p.status === 'success').length;
    const failed = pipelines.filter((p) => p.status === 'failed').length;
    const pipelineSuccessRate =
      success + failed > 0 ? Math.round((success / (success + failed)) * 1000) / 10 : null;

    const doneTasks = await this.prisma.task.findMany({
      where: {
        ...taskWhere,
        status: TaskStatus.DONE,
        updatedAt: { gte: since },
      },
      select: { id: true, createdAt: true, updatedAt: true },
    });
    const leadSamples = doneTasks.map(
      (t) => (t.updatedAt.getTime() - t.createdAt.getTime()) / 86400000,
    );
    const leadTimeDays = leadSamples.length
      ? Math.round((leadSamples.reduce((a, b) => a + b, 0) / leadSamples.length) * 10) / 10
      : null;

    const merged = await this.prisma.taskMergeRequest.findMany({
      where: {
        state: 'merged',
        mergedAt: { gte: since },
        task: { projectId: { in: projectIds } },
      },
      select: { taskId: true, mergedAt: true },
    });
    const cycleSamples: number[] = [];
    for (const m of merged) {
      if (!m.mergedAt) continue;
      const firstCommit = linkedCommits
        .filter((c) => c.taskId === m.taskId)
        .map((c) => c.committedAt || c.createdAt)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      if (firstCommit) {
        cycleSamples.push((m.mergedAt.getTime() - firstCommit.getTime()) / 86400000);
      }
    }
    const cycleTimeDays = cycleSamples.length
      ? Math.round((cycleSamples.reduce((a, b) => a + b, 0) / cycleSamples.length) * 10) / 10
      : null;

    return {
      periodDays: days,
      projects,
      metrics: {
        wip,
        overdue,
        openMrs,
        staleMrs,
        pipelineSuccessRate,
        pipelineSampleSize: success + failed,
        leadTimeDays,
        cycleTimeDays,
        doneInPeriod: doneTasks.length,
      },
    };
  }
}
