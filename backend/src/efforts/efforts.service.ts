import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EffortJudgeSource,
  EffortSource,
  EffortStatus,
  ProjectType,
  Role,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEffortDto } from './dto/create-effort.dto';
import { CreateEffortFromCommitDto } from './dto/create-effort-from-commit.dto';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { ReviewEffortDto } from './dto/review-effort.dto';
import { GitlabService } from '../gitlab/gitlab.service';
import { suggestHoursFromCommit } from './effort-suggest.util';
import { EffortJudgeService } from './effort-judge.service';

const effortInclude = {
  task: {
    select: {
      id: true,
      title: true,
      status: true,
      project: { select: { id: true, name: true, type: true } },
    },
  },
  user: { select: { id: true, fullName: true } },
  reviewer: { select: { id: true, fullName: true } },
  commit: {
    select: {
      id: true,
      sha: true,
      title: true,
      webUrl: true,
      authorName: true,
      committedAt: true,
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
      sourceBranch: true,
      targetBranch: true,
    },
  },
};

@Injectable()
export class EffortsService {
  constructor(
    private prisma: PrismaService,
    private judge: EffortJudgeService,
    private gitlab: GitlabService,
  ) {}

  /** Strip admin-only salary advice from payloads for non-admins */
  private sanitize(effort: any, role: Role) {
    if (role === Role.ADMIN) return effort;
    const { suggestedHours, adviceMeta, judgeSource, ...rest } = effort;
    if (rest.commit) {
      const { additions, deletions, ...c } = rest.commit;
      rest.commit = c;
    }
    return rest;
  }

  private sanitizeList(rows: any[], role: Role) {
    return rows.map((r) => this.sanitize(r, role));
  }

  async findAll(user: { id: number; role: Role }, status?: EffortStatus) {
    const where: any = {};
    if (status) where.status = status;
    if (user.role !== Role.ADMIN) where.userId = user.id;
    const rows = await this.prisma.effortLog.findMany({
      where,
      include: effortInclude,
      orderBy: { createdAt: 'desc' },
    });
    return this.sanitizeList(rows, user.role);
  }

  /**
   * All project MRs from GitLab (opened / merged / closed / …).
   * User picks by mrIid; no LOC advice exposed here.
   */
  async completionOptions(taskId: number, user: { id: number; role: Role }) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: true,
        assignees: true,
        mergeRequests: true,
      },
    });
    if (!task) throw new NotFoundException('وظیفه یافت نشد');
    if (task.project?.type !== ProjectType.SOFTWARE) {
      throw new BadRequestException('تکمیل با MR فقط برای پروژه‌های نرم‌افزاری است');
    }
    if (!task.project.gitlabProjectId) {
      throw new BadRequestException('این پروژه به مخزن گیت‌لب متصل نیست');
    }
    const assigned = task.assignees.some((a) => a.userId === user.id);
    if (!assigned && user.role !== Role.ADMIN) {
      throw new ForbiddenException('فقط مسئولان وظیفه می‌توانند تکمیل کنند');
    }

    const remoteMrs = await this.gitlab.listMergeRequests(task.project.gitlabProjectId, 'all');

    const linkedByIid = new Map(task.mergeRequests.map((m) => [m.mrIid, m]));
    const claimed = await this.prisma.effortLog.findMany({
      where: {
        userId: user.id,
        taskId,
        mergeRequestId: { not: null },
      },
      include: { mergeRequest: { select: { mrIid: true } } },
    });
    const claimedIids = new Set(
      claimed.map((c) => c.mergeRequest?.mrIid).filter((x): x is number => x != null),
    );

    const mergeRequests = remoteMrs.map((m: any) => {
      const linked = linkedByIid.get(m.iid);
      return {
        mrIid: m.iid,
        title: m.title,
        state: m.state,
        webUrl: m.web_url,
        sourceBranch: m.source_branch,
        targetBranch: m.target_branch,
        authorName: m.author?.name || m.author?.username,
        draft: Boolean(m.draft || m.work_in_progress),
        linkedToTask: Boolean(linked),
        localId: linked?.id ?? null,
        claimed: claimedIids.has(m.iid),
      };
    });

    // Sort: opened first, then merged, then closed/other
    const order: Record<string, number> = { opened: 0, merged: 1, closed: 2, locked: 3 };
    mergeRequests.sort(
      (a, b) => (order[a.state || ''] ?? 9) - (order[b.state || ''] ?? 9) || b.mrIid - a.mrIid,
    );

    return {
      taskId: task.id,
      title: task.title,
      gitlabProjectId: task.project.gitlabProjectId,
      mergeRequests,
    };
  }

  /** Commits list for optional claims — never expose suggestedHours to caller here */
  async claimableCommits(taskId: number, userId: number, role: Role) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: true,
        assignees: true,
        commits: { orderBy: { committedAt: 'desc' } },
      },
    });
    if (!task) throw new NotFoundException('وظیفه یافت نشد');
    if (task.project?.type !== ProjectType.SOFTWARE) {
      throw new BadRequestException('ثبت زمان از کامیت فقط برای پروژه‌های نرم‌افزاری است');
    }
    if (!task.assignees.some((a) => a.userId === userId)) {
      throw new ForbiddenException('فقط مسئولان وظیفه می‌توانند زمان ثبت کنند');
    }

    const claimed = await this.prisma.effortLog.findMany({
      where: { userId, commitId: { not: null }, taskId },
      select: { commitId: true, id: true, status: true, hours: true, approvedHours: true },
    });
    const claimedByCommit = new Map(claimed.map((c) => [c.commitId!, c]));

    return task.commits.map((c) => {
      const claim = claimedByCommit.get(c.id);
      const base: any = {
        id: c.id,
        sha: c.sha,
        title: c.title,
        webUrl: c.webUrl,
        authorName: c.authorName,
        committedAt: c.committedAt,
        claimed: Boolean(claim),
        claim: claim || null,
      };
      if (role === Role.ADMIN) {
        base.additions = c.additions;
        base.deletions = c.deletions;
        base.suggestedHours = suggestHoursFromCommit(c);
      }
      return base;
    });
  }

  async create(dto: CreateEffortDto, userId: number) {
    const task = await this.prisma.task.findUnique({
      where: { id: dto.taskId },
      include: { assignees: true, project: true },
    });
    if (!task) throw new NotFoundException('وظیفه یافت نشد');
    if (!task.assignees.some((a) => a.userId === userId)) {
      throw new ForbiddenException('فقط مسئولان وظیفه می‌توانند زمان ثبت کنند');
    }
    if (task.project?.type === ProjectType.SOFTWARE) {
      throw new BadRequestException(
        'برای پروژه نرم‌افزاری، تکمیل وظیفه با انتخاب MR و ثبت زمان انجام دهید',
      );
    }

    return this.prisma.effortLog.create({
      data: {
        taskId: dto.taskId,
        userId,
        hours: dto.hours,
        description: dto.description,
        workDate: dto.workDate ? new Date(dto.workDate) : new Date(),
        source: EffortSource.MANUAL,
      },
      include: effortInclude,
    });
  }

  async createFromCommit(dto: CreateEffortFromCommitDto, userId: number, role: Role) {
    const commit = await this.prisma.taskCommit.findUnique({
      where: { id: dto.commitId },
      include: {
        task: { include: { assignees: true, project: true } },
      },
    });
    if (!commit) throw new NotFoundException('کامیت یافت نشد');
    if (commit.task.project?.type !== ProjectType.SOFTWARE) {
      throw new BadRequestException('ثبت زمان از کامیت فقط برای پروژه‌های نرم‌افزاری است');
    }
    if (!commit.task.assignees.some((a) => a.userId === userId)) {
      throw new ForbiddenException('فقط مسئولان وظیفه می‌توانند زمان ثبت کنند');
    }

    const existing = await this.prisma.effortLog.findFirst({
      where: { userId, commitId: commit.id },
    });
    if (existing) throw new ConflictException('برای این کامیت قبلاً زمان ثبت کرده‌اید');

    const advice = await this.judge.judge({
      claimedHours: dto.hours,
      commits: [commit],
    });

    const desc = dto.description || `کامیت ${commit.sha.slice(0, 8)}: ${commit.title}`;

    try {
      const row = await this.prisma.effortLog.create({
        data: {
          taskId: commit.taskId,
          userId,
          hours: dto.hours,
          suggestedHours: advice.suggestedHours ?? undefined,
          judgeSource: advice.judgeSource,
          adviceMeta: advice.adviceMeta,
          description: desc,
          source: EffortSource.COMMIT,
          commitId: commit.id,
          workDate: commit.committedAt || new Date(),
        },
        include: effortInclude,
      });
      return this.sanitize(row, role);
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('برای این کامیت قبلاً زمان ثبت کرده‌اید');
      throw e;
    }
  }

  /**
   * SOFTWARE done gate: pick any project MR (by GitLab iid) + claim hours
   * → link MR to task if needed → PENDING effort + status DONE.
   * Suggested hours from changed lines are stored for admin only.
   */
  async completeWithMergeRequest(
    taskId: number,
    dto: CompleteTaskDto,
    user: { id: number; role: Role },
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: true,
        assignees: true,
        commits: true,
        mergeRequests: true,
      },
    });
    if (!task) throw new NotFoundException('وظیفه یافت نشد');
    if (task.project?.type !== ProjectType.SOFTWARE) {
      throw new BadRequestException('این مسیر فقط برای پروژه‌های نرم‌افزاری است');
    }
    if (!task.project.gitlabProjectId) {
      throw new BadRequestException('این پروژه به مخزن گیت‌لب متصل نیست');
    }
    const assigned = task.assignees.some((a) => a.userId === user.id);
    if (!assigned && user.role !== Role.ADMIN) {
      throw new ForbiddenException('فقط مسئولان وظیفه می‌توانند تکمیل کنند');
    }

    const remoteList = await this.gitlab.listMergeRequests(task.project.gitlabProjectId, 'all');
    const remote = remoteList.find((m: any) => m.iid === dto.mrIid);
    if (!remote) {
      throw new BadRequestException('این مرج‌ریکوئست در پروژه گیت‌لب یافت نشد');
    }

    const mr = await this.prisma.taskMergeRequest.upsert({
      where: { taskId_mrIid: { taskId, mrIid: dto.mrIid } },
      create: {
        taskId,
        mrIid: remote.iid,
        title: remote.title,
        state: remote.state,
        webUrl: remote.web_url,
        sourceBranch: remote.source_branch,
        targetBranch: remote.target_branch,
        authorName: remote.author?.name || remote.author?.username,
        draft: Boolean(remote.draft || remote.work_in_progress),
        mergedAt: remote.merged_at ? new Date(remote.merged_at) : undefined,
        closedAt: remote.closed_at ? new Date(remote.closed_at) : undefined,
        pipelineStatus: remote.head_pipeline?.status || remote.pipeline?.status,
        updatedAtGitlab: remote.updated_at ? new Date(remote.updated_at) : undefined,
      },
      update: {
        title: remote.title,
        state: remote.state,
        webUrl: remote.web_url,
        sourceBranch: remote.source_branch,
        targetBranch: remote.target_branch,
        authorName: remote.author?.name || remote.author?.username,
        draft: Boolean(remote.draft || remote.work_in_progress),
        mergedAt: remote.merged_at ? new Date(remote.merged_at) : undefined,
        closedAt: remote.closed_at ? new Date(remote.closed_at) : undefined,
        pipelineStatus: remote.head_pipeline?.status || remote.pipeline?.status,
        updatedAtGitlab: remote.updated_at ? new Date(remote.updated_at) : undefined,
      },
    });

    const existing = await this.prisma.effortLog.findFirst({
      where: { userId: user.id, mergeRequestId: mr.id },
    });
    if (existing) {
      throw new ConflictException('برای این MR قبلاً زمان ثبت کرده‌اید');
    }

    const advice = await this.judge.judge({
      claimedHours: dto.hours,
      commits: task.commits,
      mergeRequest: mr,
      taskTitle: task.title,
    });

    const desc =
      dto.description ||
      `تکمیل وظیفه با MR !${mr.mrIid}: ${mr.title}`;

    const [effort, updatedTask] = await this.prisma.$transaction(async (tx) => {
      const effortRow = await tx.effortLog.create({
        data: {
          taskId,
          userId: user.id,
          hours: dto.hours,
          suggestedHours: advice.suggestedHours ?? undefined,
          judgeSource: advice.judgeSource,
          adviceMeta: advice.adviceMeta,
          description: desc,
          source: EffortSource.MERGE_REQUEST,
          mergeRequestId: mr.id,
          workDate: new Date(),
        },
        include: effortInclude,
      });

      const taskRow = await tx.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.DONE },
        include: {
          project: true,
          assignees: { include: { user: { select: { id: true, fullName: true } } } },
          mergeRequests: true,
          commits: true,
          efforts: { include: effortInclude, orderBy: { createdAt: 'desc' } },
        },
      });

      return [effortRow, taskRow];
    });

    return {
      task: updatedTask,
      effort: this.sanitize(effort, user.role),
      message: 'وظیفه تکمیل شد؛ زمان ثبت‌شده منتظر تأیید ادمین است',
    };
  }

  async review(id: number, dto: ReviewEffortDto, reviewerId: number) {
    const effort = await this.prisma.effortLog.findUnique({
      where: { id },
      include: { commit: true, mergeRequest: true },
    });
    if (!effort) throw new NotFoundException('ثبت زمان یافت نشد');

    let approvedHours: number | null =
      dto.status === EffortStatus.APPROVED
        ? dto.approvedHours ?? effort.hours
        : dto.status === EffortStatus.ADJUSTED
          ? dto.approvedHours ?? effort.suggestedHours ?? effort.hours
          : null;

    if (
      dto.status === EffortStatus.ADJUSTED &&
      dto.approvedHours == null &&
      effort.suggestedHours != null
    ) {
      approvedHours = effort.suggestedHours;
    }

    let reviewNote = dto.reviewNote;
    if (!reviewNote) {
      const ref = effort.mergeRequest
        ? `MR !${effort.mergeRequest.mrIid}`
        : effort.commit
          ? `کامیت ${effort.commit.sha.slice(0, 8)}`
          : 'ثبت زمان';
      if (dto.status === EffortStatus.APPROVED) {
        reviewNote = `تأیید ادعا (${ref})`;
      } else if (dto.status === EffortStatus.ADJUSTED) {
        reviewNote = `اصلاح (${ref}) — ادعا: ${effort.hours}س، پیشنهاد سیستم: ${effort.suggestedHours ?? '—'}س`;
      } else if (dto.status === EffortStatus.REJECTED) {
        reviewNote = `رد (${ref})`;
      }
    }

    return this.prisma.effortLog.update({
      where: { id },
      data: {
        status: dto.status,
        approvedHours: approvedHours ?? undefined,
        reviewNote,
        reviewerId,
      },
      include: effortInclude,
    });
  }
}
