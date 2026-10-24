-- AlterEnum: Jira-like task link types (Postgres 16)
DO $$ BEGIN
  ALTER TYPE "TaskDependencyType" ADD VALUE 'RELATES_TO';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "TaskDependencyType" ADD VALUE 'DUPLICATES';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "TaskDependencyType" ADD VALUE 'IS_DUPLICATED_BY';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
