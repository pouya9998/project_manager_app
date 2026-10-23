import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GitlabService } from '../gitlab/gitlab.service';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private gitlab: GitlabService,
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

  async create(dto: CreateProjectDto) {
    let gitlabMeta: Partial<{
      gitlabProjectId: number;
      gitlabPath: string;
      gitlabWebUrl: string;
      name: string;
      description: string;
    }> = {};

    if (dto.gitlabProjectId) {
      const gp = await this.gitlab.getProject(dto.gitlabProjectId);
      gitlabMeta = {
        gitlabProjectId: gp.id,
        gitlabPath: gp.path_with_namespace,
        gitlabWebUrl: gp.web_url,
        name: dto.name || gp.name,
        description: dto.description ?? gp.description,
      };
    }

    return this.prisma.project.create({
      data: {
        name: dto.name || gitlabMeta.name || 'پروژه بدون نام',
        description: dto.description ?? gitlabMeta.description,
        gitlabProjectId: gitlabMeta.gitlabProjectId,
        gitlabPath: gitlabMeta.gitlabPath,
        gitlabWebUrl: gitlabMeta.gitlabWebUrl,
      },
      include: {
        steps: true,
        _count: { select: { tasks: true, steps: true } },
      },
    });
  }

  async update(id: number, dto: CreateProjectDto) {
    await this.ensure(id);
    return this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        gitlabProjectId: dto.gitlabProjectId,
        isActive: dto.isActive,
      },
    });
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
