import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ProjectType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GitlabService } from '../gitlab/gitlab.service';
import { GitlabSyncService } from '../gitlab/gitlab-sync.service';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private gitlab: GitlabService,
    private sync: GitlabSyncService,
  ) {}

  findAll() {
    return this.prisma.project.findMany({
      orderBy: { id: 'desc' },
      include: {
        _count: { select: { tasks: true, steps: true } },
        steps: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async findOne(id: number) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        _count: { select: { tasks: true, steps: true } },
        steps: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!project) throw new NotFoundException('پروژه یافت نشد');
    return project;
  }

  listSteps(projectId: number) {
    return this.prisma.projectStep.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createStep(projectId: number, data: { title: string; color?: string }) {
    await this.ensure(projectId);
    const last = await this.prisma.projectStep.findFirst({
      where: { projectId },
      orderBy: { sortOrder: 'desc' },
    });
    return this.prisma.projectStep.create({
      data: {
        projectId,
        title: data.title,
        color: data.color || '#64748b',
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
  }

  async updateStep(
    projectId: number,
    stepId: number,
    data: { title?: string; color?: string; sortOrder?: number },
  ) {
    await this.ensureStep(projectId, stepId);
    return this.prisma.projectStep.update({
      where: { id: stepId },
      data,
    });
  }

  async removeStep(projectId: number, stepId: number) {
    await this.ensureStep(projectId, stepId);
    await this.prisma.task.updateMany({
      where: { stepId },
      data: { stepId: null },
    });
    return this.prisma.projectStep.delete({ where: { id: stepId } });
  }

  async reorderSteps(projectId: number, ids: number[]) {
    await this.ensure(projectId);
    await Promise.all(
      ids.map((id, index) =>
        this.prisma.projectStep.updateMany({
          where: { id, projectId },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.listSteps(projectId);
  }

  private async ensureStep(projectId: number, stepId: number) {
    const step = await this.prisma.projectStep.findFirst({
      where: { id: stepId, projectId },
    });
    if (!step) throw new NotFoundException('مرحله یافت نشد');
    return step;
  }

  private async resolveGitlabMeta(dto: CreateProjectDto, type: ProjectType) {
    if (type !== ProjectType.SOFTWARE) {
      if (dto.gitlabProjectId) {
        throw new BadRequestException('اتصال گیت‌لب فقط برای پروژه‌های نرم‌افزاری مجاز است');
      }
      return {
        gitlabProjectId: null as number | null,
        gitlabPath: null as string | null,
        gitlabWebUrl: null as string | null,
      };
    }

    if (dto.gitlabProjectId) {
      const gp = await this.gitlab.getProject(dto.gitlabProjectId);
      return {
        gitlabProjectId: gp.id as number,
        gitlabPath: gp.path_with_namespace as string,
        gitlabWebUrl: gp.web_url as string,
        name: dto.name || gp.name,
        description: dto.description ?? gp.description,
      };
    }

    return {};
  }

  async create(dto: CreateProjectDto) {
    const type = dto.type || (dto.gitlabProjectId ? ProjectType.SOFTWARE : ProjectType.NON_SOFTWARE);
    const gitlabMeta = await this.resolveGitlabMeta(dto, type);

    return this.prisma.project.create({
      data: {
        name: dto.name || (gitlabMeta as any).name || 'پروژه بدون نام',
        description: dto.description ?? (gitlabMeta as any).description,
        type,
        gitlabProjectId: (gitlabMeta as any).gitlabProjectId ?? null,
        gitlabPath: (gitlabMeta as any).gitlabPath ?? null,
        gitlabWebUrl: (gitlabMeta as any).gitlabWebUrl ?? null,
        workflowRules: dto.workflowRules ?? undefined,
      },
      include: {
        steps: true,
        _count: { select: { tasks: true, steps: true } },
      },
    });
  }

  async update(id: number, dto: CreateProjectDto) {
    const existing = await this.ensure(id);
    const type = dto.type ?? existing.type;
    const gitlabMeta = await this.resolveGitlabMeta(
      {
        ...dto,
        gitlabProjectId:
          dto.gitlabProjectId === undefined ? existing.gitlabProjectId ?? undefined : dto.gitlabProjectId,
      },
      type,
    );

    const clearGitlab = type === ProjectType.NON_SOFTWARE;

    return this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        type,
        isActive: dto.isActive,
        workflowRules: dto.workflowRules === undefined ? undefined : dto.workflowRules,
        gitlabProjectId: clearGitlab
          ? null
          : (gitlabMeta as any).gitlabProjectId !== undefined
            ? (gitlabMeta as any).gitlabProjectId
            : dto.gitlabProjectId === null
              ? null
              : undefined,
        gitlabPath: clearGitlab
          ? null
          : (gitlabMeta as any).gitlabPath !== undefined
            ? (gitlabMeta as any).gitlabPath
            : undefined,
        gitlabWebUrl: clearGitlab
          ? null
          : (gitlabMeta as any).gitlabWebUrl !== undefined
            ? (gitlabMeta as any).gitlabWebUrl
            : undefined,
      },
    });
  }

  async syncGitlab(id: number) {
    return this.sync.syncProject(id);
  }

  async remove(id: number) {
    await this.ensure(id);
    return this.prisma.project.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async ensure(id: number) {
    const p = await this.prisma.project.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('پروژه یافت نشد');
    return p;
  }
}
