import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ProjectType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertGitlabConfigDto } from './dto/upsert-config.dto';
import { decryptSecret, encryptSecret, randomToken } from '../common/crypto.util';
import { extractTaskRefs } from '../common/task-refs.util';

@Injectable()
export class GitlabService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    const rows = await this.prisma.gitLabConfig.findMany({
      where: {
        accessToken: { not: '' },
        OR: [{ tokenCiphertext: null }, { tokenCiphertext: '' }],
      },
    });
    for (const row of rows) {
      if (!row.accessToken) continue;
      await this.prisma.gitLabConfig.update({
        where: { id: row.id },
        data: {
          tokenCiphertext: encryptSecret(row.accessToken),
          tokenLast4: row.accessToken.slice(-4),
          accessToken: '',
          webhookSecret: row.webhookSecret || randomToken(16),
        },
      });
    }
  }

  private sanitizeConfig(config: any) {
    if (!config) return null;
    const { accessToken, tokenCiphertext, ...rest } = config;
    return {
      ...rest,
      accessToken: config.tokenLast4 ? `••••••••${config.tokenLast4}` : '',
      hasToken: Boolean(config.tokenCiphertext || config.accessToken),
      webhookSecret: config.webhookSecret ? '••••configured' : null,
      hasWebhookSecret: Boolean(config.webhookSecret),
    };
  }

  async getConfig() {
    const config = await this.prisma.gitLabConfig.findFirst({
      where: { isActive: true },
      orderBy: { id: 'desc' },
    });
    return this.sanitizeConfig(config);
  }

  async upsertConfig(dto: UpsertGitlabConfigDto) {
    const existing = await this.prisma.gitLabConfig.findFirst({
      where: { isActive: true },
      orderBy: { id: 'desc' },
    });

    const baseUrl = dto.baseUrl.replace(/\/$/, '');
    let tokenCiphertext = existing?.tokenCiphertext || null;
    let tokenLast4 = existing?.tokenLast4 || null;
    let accessTokenLegacy = existing?.accessToken || '';

    if (dto.accessToken) {
      tokenCiphertext = encryptSecret(dto.accessToken);
      tokenLast4 = dto.accessToken.slice(-4);
      accessTokenLegacy = ''; // stop storing plaintext
    } else if (!tokenCiphertext && !accessTokenLegacy) {
      throw new BadRequestException('توکن دسترسی الزامی است');
    }

    const webhookSecret = existing?.webhookSecret || randomToken(16);

    const data = {
      name: dto.name || existing?.name || 'پیش‌فرض',
      baseUrl,
      accessToken: accessTokenLegacy,
      tokenCiphertext,
      tokenLast4,
      webhookSecret,
      isActive: true,
    };

    const saved = existing
      ? await this.prisma.gitLabConfig.update({ where: { id: existing.id }, data })
      : await this.prisma.gitLabConfig.create({ data });

    // migrate legacy plaintext if present
    if (!saved.tokenCiphertext && saved.accessToken) {
      await this.prisma.gitLabConfig.update({
        where: { id: saved.id },
        data: {
          tokenCiphertext: encryptSecret(saved.accessToken),
          tokenLast4: saved.accessToken.slice(-4),
          accessToken: '',
        },
      });
    }

    return this.sanitizeConfig(
      await this.prisma.gitLabConfig.findUnique({ where: { id: saved.id } }),
    );
  }

  async disconnect() {
    const existing = await this.prisma.gitLabConfig.findFirst({
      where: { isActive: true },
      orderBy: { id: 'desc' },
    });
    if (!existing) return { ok: true };
    await this.prisma.gitLabConfig.update({
      where: { id: existing.id },
      data: {
        isActive: false,
        accessToken: '',
        tokenCiphertext: null,
        lastHealthOk: false,
        lastHealthError: 'قطع شده توسط ادمین',
      },
    });
    return { ok: true };
  }

  async getActiveCredentials() {
    const config = await this.prisma.gitLabConfig.findFirst({
      where: { isActive: true },
      orderBy: { id: 'desc' },
    });
    if (!config) {
      throw new BadRequestException('تنظیمات گیت‌لب در پنل ادمین ثبت نشده است');
    }
    const token = config.tokenCiphertext
      ? decryptSecret(config.tokenCiphertext)
      : config.accessToken;
    if (!token) throw new BadRequestException('توکن گیت‌لب موجود نیست');
    return { ...config, resolvedToken: token };
  }

  private async sleep(ms: number) {
    await new Promise((r) => setTimeout(r, ms));
  }

  async requestRaw(
    path: string,
    query: Record<string, string | number> = {},
    opts: { method?: string; body?: any; maxRetries?: number } = {},
  ): Promise<{ data: any; headers: Headers; status: number }> {
    const config = await this.getActiveCredentials();
    const url = new URL(`${config.baseUrl}/api/v4${path}`);
    Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, String(v)));

    const maxRetries = opts.maxRetries ?? 3;
    let lastError: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let res: Response;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        res = await fetch(url.toString(), {
          method: opts.method || 'GET',
          headers: {
            'PRIVATE-TOKEN': config.resolvedToken,
            ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: opts.body ? JSON.stringify(opts.body) : undefined,
          signal: controller.signal,
        });
        clearTimeout(timer);
      } catch {
        lastError = new ServiceUnavailableException('اتصال به گیت‌لب برقرار نشد');
        if (attempt < maxRetries) {
          await this.sleep(300 * Math.pow(2, attempt));
          continue;
        }
        throw lastError;
      }

      if (res.status === 401 || res.status === 403) {
        throw new UnauthorizedException('توکن گیت‌لب نامعتبر یا بدون دسترسی است');
      }

      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get('Retry-After') || 0);
        await this.sleep(retryAfter ? retryAfter * 1000 : 400 * Math.pow(2, attempt));
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new BadRequestException(`خطای گیت‌لب (${res.status}): ${text.slice(0, 200)}`);
      }

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      return { data, headers: res.headers, status: res.status };
    }
    throw lastError || new ServiceUnavailableException('گیت‌لب در دسترس نیست');
  }

  async request<T>(path: string, query: Record<string, string | number> = {}): Promise<T> {
    const { data } = await this.requestRaw(path, query);
    return data as T;
  }

  async requestPaginated<T>(
    path: string,
    query: Record<string, string | number> = {},
    maxPages = 5,
  ): Promise<T[]> {
    const all: T[] = [];
    let page = 1;
    while (page <= maxPages) {
      const { data, headers } = await this.requestRaw(path, {
        ...query,
        per_page: Number(query.per_page || 50),
        page,
      });
      if (Array.isArray(data)) all.push(...data);
      else break;
      const next = headers.get('x-next-page');
      if (!next) break;
      page = Number(next);
      if (!page) break;
    }
    return all;
  }

  listProjects(search?: string) {
    return this.requestPaginated<any>('/projects', {
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
    return this.requestPaginated<any>(`/projects/${projectId}/repository/commits`, {
      per_page: 50,
      ...(search ? { search } : {}),
    }, 3);
  }

  listMergeRequests(projectId: number, state = 'all') {
    return this.requestPaginated<any>(`/projects/${projectId}/merge_requests`, {
      state,
      per_page: 50,
    }, 3);
  }

  listBranches(projectId: number) {
    return this.requestPaginated<any>(`/projects/${projectId}/repository/branches`, {
      per_page: 50,
    }, 3);
  }

  listPipelines(projectId: number) {
    return this.requestPaginated<any>(`/projects/${projectId}/pipelines`, {
      per_page: 30,
    }, 2);
  }

  listReleases(projectId: number) {
    return this.requestPaginated<any>(`/projects/${projectId}/releases`, {
      per_page: 20,
    }, 2);
  }

  async testConnection() {
    try {
      const user = await this.request<any>('/user');
      await this.request<any[]>('/projects', { membership: 1, per_page: 1, simple: 1 });
      const active = await this.prisma.gitLabConfig.findFirst({
        where: { isActive: true },
        orderBy: { id: 'desc' },
      });
      if (active) {
        await this.prisma.gitLabConfig.update({
          where: { id: active.id },
          data: {
            lastHealthAt: new Date(),
            lastHealthOk: true,
            lastHealthError: null,
          },
        });
      }
      return {
        ok: true,
        username: user.username,
        name: user.name,
        message: 'اتصال و دسترسی پروژه‌ها تأیید شد',
      };
    } catch (e: any) {
      const active = await this.prisma.gitLabConfig.findFirst({
        where: { isActive: true },
        orderBy: { id: 'desc' },
      });
      if (active) {
        await this.prisma.gitLabConfig.update({
          where: { id: active.id },
          data: {
            lastHealthAt: new Date(),
            lastHealthOk: false,
            lastHealthError: e?.message || 'health check failed',
          },
        });
      }
      throw e;
    }
  }

  async assertSoftwareProject(projectId: number) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('پروژه یافت نشد');
    if (project.type !== ProjectType.SOFTWARE) {
      throw new ForbiddenException('این قابلیت فقط برای پروژه‌های نرم‌افزاری است');
    }
    return project;
  }

  async ensureSoftwareGitlabProject(projectId: number) {
    const project = await this.assertSoftwareProject(projectId);
    if (!project.gitlabProjectId) {
      throw new BadRequestException('این پروژه به مخزن گیت‌لب متصل نیست');
    }
    return project;
  }

  /** @deprecated use ensureSoftwareGitlabProject */
  async ensureProjectHasGitlab(projectId: number) {
    return this.ensureSoftwareGitlabProject(projectId);
  }

  findInternalProjectByGitlabId(gitlabProjectId: number) {
    return this.prisma.project.findFirst({
      where: { gitlabProjectId, type: ProjectType.SOFTWARE, isActive: true },
    });
  }

  extractTaskRefs(text: string): number[] {
    return extractTaskRefs(text);
  }

  async recordEvent(input: {
    taskId: number;
    projectId?: number | null;
    type: any;
    source: any;
    externalId?: string | null;
    title: string;
    body?: string;
    actorName?: string;
    webUrl?: string;
    meta?: any;
    occurredAt?: Date;
  }) {
    if (input.externalId) {
      const existing = await this.prisma.taskEngineeringEvent.findFirst({
        where: { source: input.source, externalId: input.externalId },
      });
      if (existing) return existing;
    }
    return this.prisma.taskEngineeringEvent.create({
      data: {
        taskId: input.taskId,
        projectId: input.projectId || undefined,
        type: input.type,
        source: input.source,
        externalId: input.externalId || undefined,
        title: input.title,
        body: input.body,
        actorName: input.actorName,
        webUrl: input.webUrl,
        meta: input.meta || undefined,
        occurredAt: input.occurredAt || new Date(),
      },
    });
  }
}
