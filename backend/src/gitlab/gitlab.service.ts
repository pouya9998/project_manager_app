import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertGitlabConfigDto } from './dto/upsert-config.dto';

@Injectable()
export class GitlabService {
  constructor(private prisma: PrismaService) {}

  async getConfig() {
    const config = await this.prisma.gitLabConfig.findFirst({
      where: { isActive: true },
      orderBy: { id: 'desc' },
    });
    if (!config) return null;
    return {
      ...config,
      accessToken: config.accessToken ? '••••••••' + config.accessToken.slice(-4) : '',
      hasToken: Boolean(config.accessToken),
    };
  }

  async upsertConfig(dto: UpsertGitlabConfigDto) {
    const existing = await this.prisma.gitLabConfig.findFirst({
      where: { isActive: true },
      orderBy: { id: 'desc' },
    });
    if (existing) {
      return this.prisma.gitLabConfig.update({
        where: { id: existing.id },
        data: {
          name: dto.name ?? existing.name,
          baseUrl: dto.baseUrl.replace(/\/$/, ''),
          accessToken: dto.accessToken || existing.accessToken,
          isActive: true,
        },
      });
    }
    if (!dto.accessToken) {
      throw new BadRequestException('توکن دسترسی الزامی است');
    }
    return this.prisma.gitLabConfig.create({
      data: {
        name: dto.name || 'پیش‌فرض',
        baseUrl: dto.baseUrl.replace(/\/$/, ''),
        accessToken: dto.accessToken,
      },
    });
  }

  async getActiveCredentials() {
    const config = await this.prisma.gitLabConfig.findFirst({
      where: { isActive: true },
      orderBy: { id: 'desc' },
    });
    if (!config) {
      throw new BadRequestException('تنظیمات گیت‌لب در پنل ادمین ثبت نشده است');
    }
    return config;
  }

  private async request<T>(path: string, query: Record<string, string | number> = {}): Promise<T> {
    const config = await this.getActiveCredentials();
    const url = new URL(`${config.baseUrl}/api/v4${path}`);
    Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: { 'PRIVATE-TOKEN': config.accessToken },
      });
    } catch {
      throw new ServiceUnavailableException('اتصال به گیت‌لب برقرار نشد');
    }
    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(`خطای گیت‌لب (${res.status}): ${text.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }

  listProjects(search?: string) {
    return this.request<any[]>('/projects', {
      membership: 1,
      simple: 1,
      per_page: 50,
      order_by: 'last_activity_at',
      ...(search ? { search } : {}),
    });
  }

  getProject(id: number) {
    return this.request<any>(`/projects/${id}`);
  }

  listCommits(projectId: number, search?: string) {
    return this.request<any[]>(`/projects/${projectId}/repository/commits`, {
      per_page: 30,
      ...(search ? { search } : {}),
    });
  }

  listMergeRequests(projectId: number, state = 'opened') {
    return this.request<any[]>(`/projects/${projectId}/merge_requests`, {
      state,
      per_page: 30,
    });
  }

  async testConnection() {
    const user = await this.request<any>('/user');
    return {
      ok: true,
      username: user.username,
      name: user.name,
      message: 'اتصال به گیت‌لب موفق بود',
    };
  }

  async ensureProjectHasGitlab(projectId: number) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('پروژه یافت نشد');
    if (!project.gitlabProjectId) {
      throw new BadRequestException('این پروژه به گیت‌لب متصل نیست');
    }
    return project;
  }
}
