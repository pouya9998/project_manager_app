import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ProjectType } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { sha256Hex } from '../common/crypto.util';
import { GitlabService } from './gitlab.service';
import { GitlabSyncService } from './gitlab-sync.service';

const webhookHits = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string, limit = 120, windowMs = 60_000) {
  const now = Date.now();
  const row = webhookHits.get(ip);
  if (!row || row.resetAt < now) {
    webhookHits.set(ip, { count: 1, resetAt: now + windowMs });
    return;
  }
  row.count += 1;
  if (row.count > limit) {
    throw new BadRequestException('نرخ درخواست وب‌هوک بیش از حد است');
  }
}

@Controller('gitlab/webhooks')
export class GitlabWebhookController {
  constructor(
    private prisma: PrismaService,
    private gitlab: GitlabService,
    private sync: GitlabSyncService,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Req() req: Request,
    @Headers('x-gitlab-token') token?: string,
    @Headers('x-gitlab-event') eventType?: string,
    @Headers('x-gitlab-event-uuid') eventUuid?: string,
    @Headers('x-gitlab-delivery') delivery?: string,
  ) {
    rateLimit(String(req.ip || req.socket?.remoteAddress || 'unknown'));
    const payload = req.body || {};
    const config = await this.prisma.gitLabConfig.findFirst({
      where: { isActive: true },
      orderBy: { id: 'desc' },
    });
    if (!config?.webhookSecret) {
      throw new BadRequestException('وب‌هوک گیت‌لب پیکربندی نشده است');
    }
    if (!token || token !== config.webhookSecret) {
      throw new UnauthorizedException('توکن وب‌هوک نامعتبر است');
    }

    const deliveryId = eventUuid || delivery || sha256Hex(JSON.stringify(payload)).slice(0, 40);
    const existing = await this.prisma.gitLabWebhookEvent.findUnique({
      where: { deliveryId },
    });
    if (existing?.processedAt) {
      return { ok: true, duplicate: true };
    }

    const gitlabProjectId =
      payload.project?.id ||
      payload.project_id ||
      payload.object_attributes?.target_project_id ||
      payload.object_attributes?.project_id;

    let project =
      typeof gitlabProjectId === 'number'
        ? await this.gitlab.findInternalProjectByGitlabId(gitlabProjectId)
        : null;

    if (project && project.type !== ProjectType.SOFTWARE) {
      throw new BadRequestException('پروژه نرم‌افزاری نیست');
    }

    const payloadHash = sha256Hex(JSON.stringify(payload));
    const row =
      existing ||
      (await this.prisma.gitLabWebhookEvent.create({
        data: {
          deliveryId,
          eventType: eventType || 'unknown',
          gitlabProjectId: typeof gitlabProjectId === 'number' ? gitlabProjectId : undefined,
          projectId: project?.id,
          payloadHash,
          payload,
        },
      }));

    if (!project) {
      await this.prisma.gitLabWebhookEvent.update({
        where: { id: row.id },
        data: {
          processedAt: new Date(),
          error: 'no mapped SOFTWARE project',
        },
      });
      return { ok: true, ignored: true, reason: 'unmapped_project' };
    }

    try {
      await this.sync.processWebhookPayload(eventType || 'unknown', payload, project.id);
      await this.prisma.gitLabWebhookEvent.update({
        where: { id: row.id },
        data: { processedAt: new Date(), error: null, projectId: project.id },
      });
      return { ok: true };
    } catch (e: any) {
      await this.prisma.gitLabWebhookEvent.update({
        where: { id: row.id },
        data: {
          processedAt: new Date(),
          error: e?.message || 'process failed',
        },
      });
      throw e;
    }
  }
}
