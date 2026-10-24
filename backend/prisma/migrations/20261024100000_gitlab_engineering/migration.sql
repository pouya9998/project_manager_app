-- Project types
CREATE TYPE "ProjectType" AS ENUM ('SOFTWARE', 'NON_SOFTWARE');

ALTER TABLE "Project" ADD COLUMN "type" "ProjectType" NOT NULL DEFAULT 'NON_SOFTWARE';
ALTER TABLE "Project" ADD COLUMN "lastGitlabSyncAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "lastGitlabSyncError" TEXT;
ALTER TABLE "Project" ADD COLUMN "workflowRules" JSONB;
ALTER TABLE "Project" ADD COLUMN "gitlabWebhookSecret" TEXT;

UPDATE "Project" SET "type" = 'SOFTWARE' WHERE "gitlabProjectId" IS NOT NULL;

-- GitLab config health + encrypted token
ALTER TABLE "GitLabConfig" ADD COLUMN "tokenCiphertext" TEXT;
ALTER TABLE "GitLabConfig" ADD COLUMN "tokenLast4" TEXT;
ALTER TABLE "GitLabConfig" ADD COLUMN "webhookSecret" TEXT;
ALTER TABLE "GitLabConfig" ADD COLUMN "lastHealthAt" TIMESTAMP(3);
ALTER TABLE "GitLabConfig" ADD COLUMN "lastHealthOk" BOOLEAN;
ALTER TABLE "GitLabConfig" ADD COLUMN "lastHealthError" TEXT;
ALTER TABLE "GitLabConfig" ADD COLUMN "lastSyncAt" TIMESTAMP(3);

UPDATE "GitLabConfig"
SET "tokenLast4" = RIGHT("accessToken", 4)
WHERE "accessToken" IS NOT NULL AND "accessToken" <> '';

-- Webhook inbox
CREATE TABLE "GitLabWebhookEvent" (
    "id" SERIAL NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "gitlabProjectId" INTEGER,
    "projectId" INTEGER,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GitLabWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GitLabWebhookEvent_deliveryId_key" ON "GitLabWebhookEvent"("deliveryId");
CREATE INDEX "GitLabWebhookEvent_projectId_createdAt_idx" ON "GitLabWebhookEvent"("projectId", "createdAt");

ALTER TABLE "GitLabWebhookEvent" ADD CONSTRAINT "GitLabWebhookEvent_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Deduplicate existing links before unique indexes
DELETE FROM "TaskCommit" a USING "TaskCommit" b
WHERE a.id > b.id AND a."taskId" = b."taskId" AND a.sha = b.sha;

DELETE FROM "TaskMergeRequest" a USING "TaskMergeRequest" b
WHERE a.id > b.id AND a."taskId" = b."taskId" AND a."mrIid" = b."mrIid";

ALTER TABLE "TaskCommit" ADD COLUMN "branch" TEXT;
ALTER TABLE "TaskCommit" ADD COLUMN "additions" INTEGER;
ALTER TABLE "TaskCommit" ADD COLUMN "deletions" INTEGER;
ALTER TABLE "TaskCommit" ADD COLUMN "pipelineStatus" TEXT;
CREATE UNIQUE INDEX "TaskCommit_taskId_sha_key" ON "TaskCommit"("taskId", "sha");

ALTER TABLE "TaskMergeRequest" ADD COLUMN "authorName" TEXT;
ALTER TABLE "TaskMergeRequest" ADD COLUMN "draft" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TaskMergeRequest" ADD COLUMN "mergedAt" TIMESTAMP(3);
ALTER TABLE "TaskMergeRequest" ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "TaskMergeRequest" ADD COLUMN "approvalsRequired" INTEGER;
ALTER TABLE "TaskMergeRequest" ADD COLUMN "approvalsReceived" INTEGER;
ALTER TABLE "TaskMergeRequest" ADD COLUMN "pipelineStatus" TEXT;
ALTER TABLE "TaskMergeRequest" ADD COLUMN "updatedAtGitlab" TIMESTAMP(3);
CREATE UNIQUE INDEX "TaskMergeRequest_taskId_mrIid_key" ON "TaskMergeRequest"("taskId", "mrIid");

-- Branches
CREATE TABLE "TaskBranch" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "webUrl" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskBranch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaskBranch_taskId_name_key" ON "TaskBranch"("taskId", "name");
ALTER TABLE "TaskBranch" ADD CONSTRAINT "TaskBranch_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Engineering timeline
CREATE TYPE "EngineeringEventSource" AS ENUM ('INTERNAL', 'GITLAB_SYNC', 'GITLAB_WEBHOOK', 'MANUAL');
CREATE TYPE "EngineeringEventType" AS ENUM (
  'TASK_CREATED', 'TASK_UPDATED', 'STATUS_CHANGED', 'ASSIGNEE_CHANGED',
  'BRANCH_OBSERVED', 'COMMIT_LINKED', 'MR_OPENED', 'MR_UPDATED', 'MR_MERGED', 'MR_CLOSED',
  'PIPELINE_STARTED', 'PIPELINE_PASSED', 'PIPELINE_FAILED', 'REVIEW_APPROVED',
  'RELEASE_CREATED', 'DEPLOYMENT_STARTED', 'DEPLOYMENT_SUCCEEDED', 'DEPLOYMENT_FAILED',
  'COMMENT_ADDED', 'MANUAL_LINK'
);

CREATE TABLE "TaskEngineeringEvent" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "type" "EngineeringEventType" NOT NULL,
    "source" "EngineeringEventSource" NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "actorName" TEXT,
    "webUrl" TEXT,
    "meta" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskEngineeringEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskEngineeringEvent_taskId_occurredAt_idx" ON "TaskEngineeringEvent"("taskId", "occurredAt");
CREATE UNIQUE INDEX "TaskEngineeringEvent_source_externalId_key"
  ON "TaskEngineeringEvent"("source", "externalId") WHERE "externalId" IS NOT NULL;
ALTER TABLE "TaskEngineeringEvent" ADD CONSTRAINT "TaskEngineeringEvent_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskEngineeringEvent" ADD CONSTRAINT "TaskEngineeringEvent_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Pipelines
CREATE TABLE "GitlabPipeline" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "gitlabPipelineId" INTEGER NOT NULL,
    "sha" TEXT,
    "ref" TEXT,
    "status" TEXT NOT NULL,
    "webUrl" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationSec" DOUBLE PRECISION,
    "taskId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GitlabPipeline_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GitlabPipeline_projectId_gitlabPipelineId_key"
  ON "GitlabPipeline"("projectId", "gitlabPipelineId");
ALTER TABLE "GitlabPipeline" ADD CONSTRAINT "GitlabPipeline_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GitlabPipeline" ADD CONSTRAINT "GitlabPipeline_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Releases / deployments
CREATE TYPE "DeployEnvironment" AS ENUM ('DEVELOPMENT', 'STAGING', 'PRODUCTION', 'OTHER');
CREATE TYPE "DeploymentStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELED');

CREATE TABLE "ProjectRelease" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "tagName" TEXT,
    "description" TEXT,
    "webUrl" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectRelease_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectRelease_projectId_idx" ON "ProjectRelease"("projectId");
ALTER TABLE "ProjectRelease" ADD CONSTRAINT "ProjectRelease_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProjectDeployment" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "releaseId" INTEGER,
    "environment" "DeployEnvironment" NOT NULL DEFAULT 'OTHER',
    "status" "DeploymentStatus" NOT NULL DEFAULT 'PENDING',
    "ref" TEXT,
    "sha" TEXT,
    "webUrl" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectDeployment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ProjectDeployment" ADD CONSTRAINT "ProjectDeployment_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectDeployment" ADD CONSTRAINT "ProjectDeployment_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "ProjectRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Task dependencies
CREATE TYPE "TaskDependencyType" AS ENUM ('BLOCKS', 'BLOCKED_BY');
CREATE TABLE "TaskDependency" (
    "id" SERIAL NOT NULL,
    "fromTaskId" INTEGER NOT NULL,
    "toTaskId" INTEGER NOT NULL,
    "type" "TaskDependencyType" NOT NULL DEFAULT 'BLOCKS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaskDependency_fromTaskId_toTaskId_type_key"
  ON "TaskDependency"("fromTaskId", "toTaskId", "type");
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_fromTaskId_fkey"
  FOREIGN KEY ("fromTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_toTaskId_fkey"
  FOREIGN KEY ("toTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Notification types (add values)
ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'PIPELINE_FAILED';
ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'MR_STALE';
ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'DEPLOYMENT_FAILED';
ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'TASK_BLOCKED';
ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'GITLAB_SYNC';

-- Task kind for software work items (lightweight)
CREATE TYPE "TaskKind" AS ENUM ('EPIC', 'FEATURE', 'STORY', 'TASK', 'BUG', 'IMPROVEMENT', 'TECH_DEBT');
ALTER TABLE "Task" ADD COLUMN "kind" "TaskKind" NOT NULL DEFAULT 'TASK';
ALTER TABLE "Task" ADD COLUMN "externalKey" TEXT;
CREATE INDEX "Task_externalKey_idx" ON "Task"("externalKey");
