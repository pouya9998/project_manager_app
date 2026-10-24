-- Effort claims linked to GitLab commits (SOFTWARE salary review)
CREATE TYPE "EffortSource" AS ENUM ('MANUAL', 'COMMIT');

ALTER TABLE "EffortLog" ADD COLUMN "suggestedHours" DOUBLE PRECISION;
ALTER TABLE "EffortLog" ADD COLUMN "source" "EffortSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "EffortLog" ADD COLUMN "commitId" INTEGER;

-- One claim per user per commit (NULLs allowed multiple times for MANUAL)
CREATE UNIQUE INDEX "EffortLog_userId_commitId_key" ON "EffortLog"("userId", "commitId");
CREATE INDEX "EffortLog_status_createdAt_idx" ON "EffortLog"("status", "createdAt");

ALTER TABLE "EffortLog" ADD CONSTRAINT "EffortLog_commitId_fkey"
  FOREIGN KEY ("commitId") REFERENCES "TaskCommit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
