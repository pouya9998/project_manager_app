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
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GitlabService } from '../gitlab/gitlab.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { LinkCommitDto } from './dto/link-commit.dto';
import { LinkMrDto } from './dto/link-mr.dto';

const SOFTWARE_DONE_HINT =
  'برای اتمام وظیفه نرم‌افزاری، MR را انتخاب و زمان را ثبت کنید (مسیر تکمیل با مرج‌ریکوئست)';

const taskInclude = {
  project: {
    include: {
      steps: { orderBy: { sortOrder: 'asc' as const } },
    },
  },
  step: true,
  creator: { select: { id: true, fullName: true, email: true } },
  assignees: {
    include: {
      user: {
        select: { id: true, fullName: true, email: true, jobPosition: true },
      },
    },
  },
  attachments: true,
  commits: { orderBy: { createdAt: 'desc' as const } },
  mergeRequests: { orderBy: { createdAt: 'desc' as const } },
  branches: { orderBy: { updatedAt: 'desc' as const } },
  efforts: {
    include: {
      user: { select: { id: true, fullName: true } },
      reviewer: { select: { id: true, fullName: true } },
      commit: {
        select: {
          id: true,
          sha: true,
          title: true,
          webUrl: true,
          additions: true,
          deletions: true,
        },
      },
      mergeRequest: {
        select: {
          id: true,
          mrIid: true,
          title: true,
          webUrl: true,
          state: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  },
  comments: {
    include: {
      user: { select: { id: true, fullName: true } },
      mentions: {
        include: { user: { select: { id: true, fullName: true } } },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  _count: { select: { efforts: true, commits: true, mergeRequests: true } },
};

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private gitlab: GitlabService,
  ) {}

  async findAll(
    user: { id: number; role: Role },
    status?: TaskStatus,
    projectId?: number,
    q?: string,
  ) {
    const and: any[] = [];
    if (status) and.push({ status });
    if (projectId) and.push({ projectId });

    const query = (q || '').trim();
    if (query) {
      const idNum = Number(query.replace(/^#/, ''));
      and.push({
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          ...(Number.isFinite(idNum) && idNum > 0 ? [{ id: idNum }] : []),
        ],
      });
    }

    if (user.role !== Role.ADMIN) {
      and.push({
        OR: [{ assignees: { some: { userId: user.id } } }, { creatorId: user.id }],
      });
    }

    return this.prisma.task.findMany({
      where: and.length ? { AND: and } : {},
      include: taskInclude,
      orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
      take: query ? 20 : undefined,
    });
  }

  async findOne(id: number, user: { id: number; role: Role }) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: taskInclude,
    });
    if (!task) throw new NotFoundException('وظیفه یافت نشد');
    this.assertAccess(task, user);
    // Hide LOC/salary advice from non-admins on nested efforts
    if (user.role !== Role.ADMIN && task.efforts?.length) {
      return {
        ...task,
        efforts: task.efforts.map((e: any) => {
          const { suggestedHours, adviceMeta, judgeSource, ...rest } = e;
          if (rest.commit) {
            const { additions, deletions, ...c } = rest.commit;
            rest.commit = c;
          }
          return rest;
        }),
      };
    }
    return task;
  }

  async create(dto: CreateTaskDto, creatorId: number, files: Express.Multer.File[] = []) {
    if (!dto.projectId) {
      throw new BadRequestException('انتخاب پروژه برای وظیفه الزامی است');
    }
    const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
    if (!project || !project.isActive) {
      throw new NotFoundException('پروژه یافت نشد');
    }

    const firstStep = await this.prisma.projectStep.findFirst({
      where: { projectId: dto.projectId },
      orderBy: { sortOrder: 'asc' },
    });

    const assigneeIds = [...new Set((dto.assigneeIds || []).map(Number).filter((id) => id > 0))];
    if (!assigneeIds.length) {
      throw new BadRequestException('حداقل یک مسئول برای وظیفه انتخاب کنید');
    }

    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status || TaskStatus.TODO,
        priority: dto.priority ?? 2,
        projectId: dto.projectId,
        stepId: firstStep?.id,
        creatorId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        assignees: {
          create: assigneeIds.map((userId) => ({ userId })),
        },
        attachments: files.length
          ? {
              create: files.map((f) => ({
                originalName: f.originalname,
                storedName: f.filename,
                mimeType: f.mimetype,
                size: f.size,
              })),
            }
          : undefined,
      },
      include: taskInclude,
    });

    await this.notifications.notifyUsers(
      assigneeIds.filter((id) => id !== creatorId),
      {
        type: AppNotificationType.TASK_ASSIGNED,
        title: 'وظیفه جدید',
        body: `وظیفه «${task.title}» به شما محول شد`,
        link: `/tasks/${task.id}`,
        meta: { taskId: task.id },
      },
    );

    await this.gitlab.recordEvent({
      taskId: task.id,
      projectId: task.projectId,
      type: EngineeringEventType.TASK_CREATED,
      source: EngineeringEventSource.INTERNAL,
      externalId: `task:created:${task.id}`,
      title: 'ایجاد وظیفه',
    });

    return task;
  }

  async update(id: number, dto: UpdateTaskDto, user: { id: number; role: Role }) {
    const task = await this.findOne(id, user);
    if (user.role !== Role.ADMIN && dto.assigneeIds) {
      throw new ForbiddenException('فقط ادمین می‌تواند مسئولان را تغییر دهد');
    }

    const previousAssignees = new Set(task.assignees.map((a) => a.userId));

    if (dto.assigneeIds) {
      await this.prisma.taskAssignee.deleteMany({ where: { taskId: id } });
      if (dto.assigneeIds.length) {
        await this.prisma.taskAssignee.createMany({
          data: dto.assigneeIds.map((userId) => ({ taskId: id, userId })),
        });
      }
    }

    const prevStatus = task.status;
    if (
      dto.status === TaskStatus.DONE &&
      prevStatus !== TaskStatus.DONE &&
      task.project?.type === ProjectType.SOFTWARE
    ) {
      throw new BadRequestException(SOFTWARE_DONE_HINT);
    }
    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        projectId: dto.projectId,
        stepId: dto.stepId === undefined ? undefined : dto.stepId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : dto.dueDate === null ? null : undefined,
      },
      include: taskInclude,
    });

    if (dto.status && dto.status !== prevStatus) {
      await this.gitlab.recordEvent({
        taskId: updated.id,
        projectId: updated.projectId,
        type: EngineeringEventType.STATUS_CHANGED,
        source: EngineeringEventSource.INTERNAL,
        externalId: `status:${updated.id}:${prevStatus}:${dto.status}:${Date.now()}`,
        title: `وضعیت: ${prevStatus} → ${dto.status}`,
      });
    }

    if (dto.assigneeIds) {
      const newlyAssigned = dto.assigneeIds.filter(
        (uid) => !previousAssignees.has(uid) && uid !== user.id,
      );
      await this.notifications.notifyUsers(newlyAssigned, {
        type: AppNotificationType.TASK_ASSIGNED,
        title: 'محول‌سازی وظیفه',
        body: `وظیفه «${updated.title}» به شما محول شد`,
        link: `/tasks/${updated.id}`,
        meta: { taskId: updated.id },
      });
      await this.gitlab.recordEvent({
        taskId: updated.id,
        projectId: updated.projectId,
        type: EngineeringEventType.ASSIGNEE_CHANGED,
        source: EngineeringEventSource.INTERNAL,
        externalId: `assignees:${updated.id}:${Date.now()}`,
        title: 'تغییر مسئولان',
      });
    }

    return updated;
  }

  async updateStatus(id: number, status: TaskStatus, user: { id: number; role: Role }) {
    const task = await this.findOne(id, user);
    if (
      status === TaskStatus.DONE &&
      task.status !== TaskStatus.DONE &&
      task.project?.type === ProjectType.SOFTWARE
    ) {
      throw new BadRequestException(SOFTWARE_DONE_HINT);
    }
    const updated = await this.prisma.task.update({
      where: { id },
      data: { status },
      include: taskInclude,
    });
    if (status !== task.status) {
      await this.gitlab.recordEvent({
        taskId: id,
        projectId: task.projectId,
        type: EngineeringEventType.STATUS_CHANGED,
        source: EngineeringEventSource.INTERNAL,
        externalId: `status:${id}:${task.status}:${status}:${Date.now()}`,
        title: `وضعیت: ${task.status} → ${status}`,
      });
    }
    return updated;
  }

  async updateStep(id: number, stepId: number | null, user: { id: number; role: Role }) {
    const task = await this.findOne(id, user);
    if (stepId != null) {
      const step = await this.prisma.projectStep.findFirst({
        where: { id: stepId, projectId: task.projectId ?? -1 },
      });
      if (!step) throw new NotFoundException('مرحله متعلق به این پروژه نیست');
    }
    return this.prisma.task.update({
      where: { id },
      data: { stepId },
      include: taskInclude,
    });
  }

  async addAttachments(id: number, files: Express.Multer.File[], user: { id: number; role: Role }) {
    await this.findOne(id, user);
    if (!files?.length) return this.findOne(id, user);
    await this.prisma.taskAttachment.createMany({
      data: files.map((f) => ({
        taskId: id,
        originalName: f.originalname,
        storedName: f.filename,
        mimeType: f.mimetype,
        size: f.size,
      })),
    });
    return this.findOne(id, user);
  }

  async linkCommit(id: number, dto: LinkCommitDto, user: { id: number; role: Role }) {
    const task = await this.findOne(id, user);
    if (!task.projectId || task.project?.type !== ProjectType.SOFTWARE) {
      throw new ForbiddenException('لینک گیت‌لب فقط برای پروژه‌های نرم‌افزاری است');
    }
    await this.gitlab.ensureSoftwareGitlabProject(task.projectId);
    const row = await this.prisma.taskCommit.upsert({
      where: { taskId_sha: { taskId: id, sha: dto.sha } },
      create: {
        taskId: id,
        sha: dto.sha,
        title: dto.title,
        webUrl: dto.webUrl,
        authorName: dto.authorName,
        committedAt: dto.committedAt ? new Date(dto.committedAt) : undefined,
      },
      update: {
        title: dto.title,
        webUrl: dto.webUrl,
        authorName: dto.authorName,
        committedAt: dto.committedAt ? new Date(dto.committedAt) : undefined,
      },
    });
    await this.gitlab.recordEvent({
      taskId: id,
      projectId: task.projectId,
      type: EngineeringEventType.COMMIT_LINKED,
      source: EngineeringEventSource.MANUAL,
      externalId: `manual-commit:${dto.sha}`,
      title: `کامیت دستی: ${dto.title}`,
      actorName: dto.authorName,
      webUrl: dto.webUrl,
    });
    return row;
  }

  async linkMr(id: number, dto: LinkMrDto, user: { id: number; role: Role }) {
    const task = await this.findOne(id, user);
    if (!task.projectId || task.project?.type !== ProjectType.SOFTWARE) {
      throw new ForbiddenException('لینک گیت‌لب فقط برای پروژه‌های نرم‌افزاری است');
    }
    await this.gitlab.ensureSoftwareGitlabProject(task.projectId);
    const row = await this.prisma.taskMergeRequest.upsert({
      where: { taskId_mrIid: { taskId: id, mrIid: dto.mrIid } },
      create: {
        taskId: id,
        mrIid: dto.mrIid,
        title: dto.title,
        state: dto.state,
        webUrl: dto.webUrl,
        sourceBranch: dto.sourceBranch,
        targetBranch: dto.targetBranch,
      },
      update: {
        title: dto.title,
        state: dto.state,
        webUrl: dto.webUrl,
        sourceBranch: dto.sourceBranch,
        targetBranch: dto.targetBranch,
      },
    });
    await this.gitlab.recordEvent({
      taskId: id,
      projectId: task.projectId,
      type: EngineeringEventType.MANUAL_LINK,
      source: EngineeringEventSource.MANUAL,
      externalId: `manual-mr:${dto.mrIid}`,
      title: `MR دستی !${dto.mrIid}: ${dto.title}`,
      webUrl: dto.webUrl,
    });
    return row;
  }

  async addComment(
    id: number,
    content: string,
    user: { id: number; role: Role },
    mentionIds: number[] = [],
  ) {
    const task = await this.findOne(id, user);
    const uniqueMentions = [...new Set(mentionIds.filter((mid) => mid && mid !== user.id))];
    const comment = await this.prisma.taskComment.create({
      data: {
        taskId: id,
        userId: user.id,
        content,
        mentions: uniqueMentions.length
          ? { create: uniqueMentions.map((userId) => ({ userId })) }
          : undefined,
      },
      include: {
        user: { select: { id: true, fullName: true } },
        mentions: {
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
    });

    if (uniqueMentions.length) {
      await this.notifications.notifyUsers(uniqueMentions, {
        type: AppNotificationType.TASK_MENTION,
        title: 'منشن در وظیفه',
        body: `${comment.user.fullName} شما را در «${task.title}» منشن کرد`,
        link: `/tasks/${id}`,
        meta: { taskId: id, commentId: comment.id },
      });
    }

    return comment;
  }

  async remove(id: number) {
    await this.prisma.task.delete({ where: { id } });
    return { ok: true };
  }

  private assertAccess(
    task: { creatorId: number; assignees: { userId: number }[] },
    user: { id: number; role: Role },
  ) {
    if (user.role === Role.ADMIN) return;
    const assigned = task.assignees.some((a) => a.userId === user.id);
    if (!assigned && task.creatorId !== user.id) {
      throw new ForbiddenException('دسترسی به این وظیفه ندارید');
    }
  }
}
