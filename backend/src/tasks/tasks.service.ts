import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppNotificationType, Role, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { LinkCommitDto } from './dto/link-commit.dto';
import { LinkMrDto } from './dto/link-mr.dto';

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
  efforts: {
    include: {
      user: { select: { id: true, fullName: true } },
      reviewer: { select: { id: true, fullName: true } },
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
  ) {}

  async findAll(
    user: { id: number; role: Role },
    status?: TaskStatus,
    projectId?: number,
  ) {
    const where: any = {};
    if (status) where.status = status;
    if (projectId) where.projectId = projectId;
    if (user.role !== Role.ADMIN) {
      where.assignees = { some: { userId: user.id } };
    }
    return this.prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  async findOne(id: number, user: { id: number; role: Role }) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: taskInclude,
    });
    if (!task) throw new NotFoundException('وظیفه یافت نشد');
    this.assertAccess(task, user);
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

    const assigneeIds = [...new Set([...(dto.assigneeIds || []), creatorId])];

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
    }

    return updated;
  }

  async updateStatus(id: number, status: TaskStatus, user: { id: number; role: Role }) {
    await this.findOne(id, user);
    return this.prisma.task.update({
      where: { id },
      data: { status },
      include: taskInclude,
    });
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
    await this.findOne(id, user);
    return this.prisma.taskCommit.create({
      data: {
        taskId: id,
        sha: dto.sha,
        title: dto.title,
        webUrl: dto.webUrl,
        authorName: dto.authorName,
        committedAt: dto.committedAt ? new Date(dto.committedAt) : undefined,
      },
    });
  }

  async linkMr(id: number, dto: LinkMrDto, user: { id: number; role: Role }) {
    await this.findOne(id, user);
    return this.prisma.taskMergeRequest.create({
      data: {
        taskId: id,
        mrIid: dto.mrIid,
        title: dto.title,
        state: dto.state,
        webUrl: dto.webUrl,
        sourceBranch: dto.sourceBranch,
        targetBranch: dto.targetBranch,
      },
    });
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
