import { Injectable, Logger } from '@nestjs/common';
import {
  AppNotificationType,
  EngineeringEventSource,
  EngineeringEventType,
  ProjectType,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GitlabService } from './gitlab.service';

@Injectable()
export class GitlabSyncService {
  private readonly logger = new Logger(GitlabSyncService.name);

  constructor(
    private prisma: PrismaService,
    private gitlab: GitlabService,
    private notifications: NotificationsService,
  ) {}

  async syncProject(projectId: number) {
    const project = await this.gitlab.ensureSoftwareGitlabProject(projectId);
    const gitlabId = project.gitlabProjectId!;
    let commitsLinked = 0;
    let mrsLinked = 0;
    let pipelinesUpserted = 0;
    let releasesUpserted = 0;

    try {
      const [commits, mrs, pipelines, releases, branches] = await Promise.all([
        this.gitlab.listCommits(gitlabId),
        this.gitlab.listMergeRequests(gitlabId, 'all'),
        this.gitlab.listPipelines(gitlabId).catch(() => []),
        this.gitlab.listReleases(gitlabId).catch(() => []),
        this.gitlab.listBranches(gitlabId).catch(() => []),
      ]);

      for (const c of commits) {
        const n = await this.linkCommitToTasks(project.id, c, EngineeringEventSource.GITLAB_SYNC);
        commitsLinked += n;
      }
      for (const m of mrs) {
        const n = await this.linkMrToTasks(project.id, m, EngineeringEventSource.GITLAB_SYNC);
        mrsLinked += n;
      }
      for (const b of branches) {
        await this.observeBranch(project.id, b, EngineeringEventSource.GITLAB_SYNC);
      }
      for (const p of pipelines) {
        await this.upsertPipeline(project.id, p);
        pipelinesUpserted++;
      }
      for (const r of releases) {
        await this.upsertRelease(project.id, r);
        releasesUpserted++;
      }

      await this.prisma.project.update({
        where: { id: project.id },
        data: { lastGitlabSyncAt: new Date(), lastGitlabSyncError: null },
      });
      const cfg = await this.prisma.gitLabConfig.findFirst({
        where: { isActive: true },
        orderBy: { id: 'desc' },
      });
      if (cfg) {
        await this.prisma.gitLabConfig.update({
          where: { id: cfg.id },
          data: { lastSyncAt: new Date() },
        });
      }

      return {
        ok: true,
        commitsLinked,
        mrsLinked,
        pipelinesUpserted,
        releasesUpserted,
        scanned: {
          commits: commits.length,
          mrs: mrs.length,
          pipelines: pipelines.length,
          releases: releases.length,
          branches: branches.length,
        },
      };
    } catch (e: any) {
      await this.prisma.project.update({
        where: { id: project.id },
        data: { lastGitlabSyncError: e?.message || 'sync failed' },
      });
      throw e;
    }
  }

  private async resolveTasks(projectId: number, text: string) {
    const ids = this.gitlab.extractTaskRefs(text);
    if (!ids.length) return [];
    return this.prisma.task.findMany({
      where: {
        projectId,
        OR: [{ id: { in: ids } }, { externalKey: { in: ids.map(String) } }],
      },
      include: { assignees: true },
    });
  }

  async linkCommitToTasks(
    projectId: number,
    c: any,
    source: EngineeringEventSource,
  ): Promise<number> {
    const text = `${c.title || ''} ${c.message || ''}`;
    const tasks = await this.resolveTasks(projectId, text);
    let linked = 0;
    for (const task of tasks) {
      try {
        await this.prisma.taskCommit.upsert({
          where: { taskId_sha: { taskId: task.id, sha: c.id || c.short_id } },
          create: {
            taskId: task.id,
            sha: c.id || c.short_id,
            title: c.title || c.message?.split('\n')[0] || 'commit',
            webUrl: c.web_url,
            authorName: c.author_name,
            committedAt: c.committed_date ? new Date(c.committed_date) : undefined,
            additions: c.stats?.additions,
            deletions: c.stats?.deletions,
          },
          update: {
            title: c.title || c.message?.split('\n')[0] || 'commit',
            webUrl: c.web_url,
            authorName: c.author_name,
            committedAt: c.committed_date ? new Date(c.committed_date) : undefined,
          },
        });
        await this.gitlab.recordEvent({
          taskId: task.id,
          projectId,
          type: EngineeringEventType.COMMIT_LINKED,
          source,
          externalId: `commit:${c.id || c.short_id}`,
          title: `کامیت: ${c.title || c.short_id}`,
          actorName: c.author_name,
          webUrl: c.web_url,
          occurredAt: c.committed_date ? new Date(c.committed_date) : undefined,
        });
        linked++;
      } catch (e) {
        this.logger.warn(`commit link failed: ${e}`);
      }
    }
    return linked;
  }

  async linkMrToTasks(projectId: number, m: any, source: EngineeringEventSource): Promise<number> {
    const text = `${m.title || ''} ${m.description || ''} ${m.source_branch || ''}`;
    const tasks = await this.resolveTasks(projectId, text);
    let linked = 0;
    for (const task of tasks) {
      try {
        const state = m.state;
        await this.prisma.taskMergeRequest.upsert({
          where: { taskId_mrIid: { taskId: task.id, mrIid: m.iid } },
          create: {
            taskId: task.id,
            mrIid: m.iid,
            title: m.title,
            state,
            webUrl: m.web_url,
            sourceBranch: m.source_branch,
            targetBranch: m.target_branch,
            authorName: m.author?.name || m.author?.username,
            draft: Boolean(m.draft || m.work_in_progress),
            mergedAt: m.merged_at ? new Date(m.merged_at) : undefined,
            closedAt: m.closed_at ? new Date(m.closed_at) : undefined,
            pipelineStatus: m.head_pipeline?.status || m.pipeline?.status,
            updatedAtGitlab: m.updated_at ? new Date(m.updated_at) : undefined,
          },
          update: {
            title: m.title,
            state,
            webUrl: m.web_url,
            sourceBranch: m.source_branch,
            targetBranch: m.target_branch,
            authorName: m.author?.name || m.author?.username,
            draft: Boolean(m.draft || m.work_in_progress),
            mergedAt: m.merged_at ? new Date(m.merged_at) : undefined,
            closedAt: m.closed_at ? new Date(m.closed_at) : undefined,
            pipelineStatus: m.head_pipeline?.status || m.pipeline?.status,
            updatedAtGitlab: m.updated_at ? new Date(m.updated_at) : undefined,
          },
        });

        let eventType: EngineeringEventType = EngineeringEventType.MR_UPDATED;
        if (state === 'merged') eventType = EngineeringEventType.MR_MERGED;
        else if (state === 'closed') eventType = EngineeringEventType.MR_CLOSED;
        else if (state === 'opened') eventType = EngineeringEventType.MR_OPENED;

        await this.gitlab.recordEvent({
          taskId: task.id,
          projectId,
          type: eventType,
          source,
          externalId: `mr:${m.iid}:${state}:${m.updated_at || ''}`,
          title: `MR !${m.iid}: ${m.title}`,
          actorName: m.author?.name || m.author?.username,
          webUrl: m.web_url,
          meta: { state },
        });

        if (state === 'merged') {
          await this.applyWorkflowRules(projectId, task.id, 'mr_merged');
        }
        linked++;
      } catch (e) {
        this.logger.warn(`mr link failed: ${e}`);
      }
    }
    return linked;
  }

  async observeBranch(projectId: number, b: any, source: EngineeringEventSource) {
    const tasks = await this.resolveTasks(projectId, b.name || '');
    for (const task of tasks) {
      await this.prisma.taskBranch.upsert({
        where: { taskId_name: { taskId: task.id, name: b.name } },
        create: {
          taskId: task.id,
          name: b.name,
          webUrl: b.web_url,
        },
        update: { webUrl: b.web_url, isDeleted: false },
      });
      await this.gitlab.recordEvent({
        taskId: task.id,
        projectId,
        type: EngineeringEventType.BRANCH_OBSERVED,
        source,
        externalId: `branch:${b.name}`,
        title: `شاخه: ${b.name}`,
        webUrl: b.web_url,
      });
    }
  }

  async upsertPipeline(projectId: number, p: any, taskId?: number) {
    const status = p.status || 'unknown';
    const row = await this.prisma.gitlabPipeline.upsert({
      where: {
        projectId_gitlabPipelineId: {
          projectId,
          gitlabPipelineId: p.id,
        },
      },
      create: {
        projectId,
        gitlabPipelineId: p.id,
        sha: p.sha,
        ref: p.ref,
        status,
        webUrl: p.web_url,
        startedAt: p.created_at ? new Date(p.created_at) : undefined,
        finishedAt: p.updated_at && ['success', 'failed', 'canceled'].includes(status)
          ? new Date(p.updated_at)
          : undefined,
        durationSec: p.duration,
        taskId: taskId || undefined,
      },
      update: {
        status,
        webUrl: p.web_url,
        sha: p.sha,
        ref: p.ref,
        durationSec: p.duration,
        taskId: taskId || undefined,
        finishedAt: ['success', 'failed', 'canceled'].includes(status)
          ? new Date(p.updated_at || Date.now())
          : undefined,
      },
    });

    if (taskId) {
      let type: EngineeringEventType = EngineeringEventType.PIPELINE_STARTED;
      if (status === 'success') type = EngineeringEventType.PIPELINE_PASSED;
      if (status === 'failed') type = EngineeringEventType.PIPELINE_FAILED;
      await this.gitlab.recordEvent({
        taskId,
        projectId,
        type,
        source: EngineeringEventSource.GITLAB_WEBHOOK,
        externalId: `pipeline:${p.id}:${status}`,
        title: `پایپلاین #${p.id}: ${status}`,
        webUrl: p.web_url,
      });
      if (status === 'failed') {
        const task = await this.prisma.task.findUnique({
          where: { id: taskId },
          include: { assignees: true },
        });
        if (task) {
          await this.notifications.notifyUsers(
            task.assignees.map((a) => a.userId),
            {
              type: AppNotificationType.PIPELINE_FAILED,
              title: 'شکست پایپلاین',
              body: `پایپلاین وظیفه «${task.title}» شکست خورد`,
              link: `/tasks/${task.id}`,
              meta: { pipelineId: p.id },
            },
          );
        }
      }
    }
    return row;
  }

  async upsertRelease(projectId: number, r: any) {
    const existing = await this.prisma.projectRelease.findFirst({
      where: { projectId, tagName: r.tag_name },
    });
    if (existing) {
      return this.prisma.projectRelease.update({
        where: { id: existing.id },
        data: {
          name: r.name || r.tag_name,
          description: r.description,
          webUrl: r._links?.self || r.web_url,
          releasedAt: r.released_at ? new Date(r.released_at) : undefined,
        },
      });
    }
    return this.prisma.projectRelease.create({
      data: {
        projectId,
        name: r.name || r.tag_name || 'release',
        tagName: r.tag_name,
        description: r.description,
        webUrl: r._links?.self || r.web_url,
        releasedAt: r.released_at ? new Date(r.released_at) : undefined,
      },
    });
  }

  async applyWorkflowRules(projectId: number, taskId: number, trigger: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.type !== ProjectType.SOFTWARE) return;
    const rules = (project.workflowRules as any) || {};
    if (!rules.enabled) return;
    if (trigger === 'mr_merged' && rules.mrMergedStatus) {
      const next = rules.mrMergedStatus as TaskStatus;
      if (Object.values(TaskStatus).includes(next)) {
        await this.prisma.task.update({ where: { id: taskId }, data: { status: next } });
        await this.gitlab.recordEvent({
          taskId,
          projectId,
          type: EngineeringEventType.STATUS_CHANGED,
          source: EngineeringEventSource.INTERNAL,
          externalId: `workflow:mr_merged:${taskId}:${Date.now()}`,
          title: `وضعیت به‌خاطر ادغام MR → ${next}`,
          meta: { rule: 'mr_merged', status: next },
        });
      }
    }
  }

  async processWebhookPayload(eventType: string, payload: any, projectId: number) {
    if (eventType === 'Push Hook' || eventType === 'push') {
      const commits = payload.commits || [];
      for (const c of commits) {
        await this.linkCommitToTasks(projectId, {
          id: c.id,
          short_id: c.id?.slice(0, 8),
          title: c.title || c.message?.split('\n')[0],
          message: c.message,
          web_url: c.url,
          author_name: c.author?.name,
          committed_date: c.timestamp,
        }, EngineeringEventSource.GITLAB_WEBHOOK);
      }
      return;
    }
    if (eventType === 'Merge Request Hook' || eventType === 'merge_request') {
      const m = payload.object_attributes || payload;
      await this.linkMrToTasks(projectId, {
        iid: m.iid,
        title: m.title,
        description: m.description,
        state: m.state,
        web_url: m.url || m.web_url,
        source_branch: m.source_branch,
        target_branch: m.target_branch,
        author: payload.user,
        draft: m.draft || m.work_in_progress,
        merged_at: m.merged_at,
        closed_at: m.closed_at,
        updated_at: m.updated_at,
      }, EngineeringEventSource.GITLAB_WEBHOOK);
      return;
    }
    if (eventType === 'Pipeline Hook' || eventType === 'pipeline') {
      const p = payload.object_attributes || payload;
      const refs = this.gitlab.extractTaskRefs(
        `${p.ref || ''} ${(payload.commit?.message) || ''}`,
      );
      let taskId: number | undefined;
      if (refs.length) {
        const task = await this.prisma.task.findFirst({
          where: { projectId, id: { in: refs } },
        });
        taskId = task?.id;
      }
      await this.upsertPipeline(
        projectId,
        {
          id: p.id,
          sha: p.sha,
          ref: p.ref,
          status: p.status,
          web_url: p.url || p.web_url,
          created_at: p.created_at,
          updated_at: p.finished_at || p.created_at,
          duration: p.duration,
        },
        taskId,
      );
      return;
    }
    if (eventType === 'Deployment Hook' || eventType === 'deployment') {
      const d = payload.deployment || payload.object_attributes || payload;
      const envRaw = String(d.environment || d.environment_tier || 'OTHER').toUpperCase();
      const environment = ['DEVELOPMENT', 'STAGING', 'PRODUCTION'].includes(envRaw)
        ? (envRaw as any)
        : 'OTHER';
      const statusMap: Record<string, any> = {
        running: 'RUNNING',
        success: 'SUCCESS',
        failed: 'FAILED',
        canceled: 'CANCELED',
        created: 'PENDING',
      };
      await this.prisma.projectDeployment.create({
        data: {
          projectId,
          environment,
          status: statusMap[d.status] || 'PENDING',
          ref: d.ref,
          sha: d.sha,
          webUrl: d.deployable_url || d.url,
          startedAt: d.created_at ? new Date(d.created_at) : undefined,
          finishedAt: d.finished_at ? new Date(d.finished_at) : undefined,
        },
      });
    }
  }
}
