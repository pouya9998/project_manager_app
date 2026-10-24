CREATE TYPE "EffortJudgeSource" AS ENUM ('NONE', 'HEURISTIC', 'AI');

ALTER TYPE "EffortSource" ADD VALUE IF NOT EXISTS 'MERGE_REQUEST';

ALTER TABLE "EffortLog" ADD COLUMN "judgeSource" "EffortJudgeSource" NOT NULL DEFAULT 'NONE';
ALTER TABLE "EffortLog" ADD COLUMN "adviceMeta" JSONB;
ALTER TABLE "EffortLog" ADD COLUMN "mergeRequestId" INTEGER;

CREATE UNIQUE INDEX "EffortLog_userId_mergeRequestId_key" ON "EffortLog"("userId", "mergeRequestId");

ALTER TABLE "EffortLog" ADD CONSTRAINT "EffortLog_mergeRequestId_fkey"
  FOREIGN KEY ("mergeRequestId") REFERENCES "TaskMergeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
