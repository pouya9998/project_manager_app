-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "LetterStatus" AS ENUM ('DRAFT', 'SENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AppNotificationType" ADD VALUE 'LETTER_RECEIVED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Letter" (
    "id" SERIAL NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "LetterStatus" NOT NULL DEFAULT 'DRAFT',
    "senderId" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Letter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LetterRecipient" (
    "id" SERIAL NOT NULL,
    "letterId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "LetterRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LetterTemplate" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" INTEGER NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LetterTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Letter_senderId_createdAt_idx" ON "Letter"("senderId", "createdAt");
CREATE INDEX IF NOT EXISTS "Letter_status_sentAt_idx" ON "Letter"("status", "sentAt");
CREATE INDEX IF NOT EXISTS "LetterRecipient_userId_readAt_idx" ON "LetterRecipient"("userId", "readAt");
CREATE INDEX IF NOT EXISTS "LetterTemplate_createdById_idx" ON "LetterTemplate"("createdById");
CREATE UNIQUE INDEX IF NOT EXISTS "LetterRecipient_letterId_userId_key" ON "LetterRecipient"("letterId", "userId");

DO $$ BEGIN
  ALTER TABLE "Letter" ADD CONSTRAINT "Letter_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "LetterRecipient" ADD CONSTRAINT "LetterRecipient_letterId_fkey"
    FOREIGN KEY ("letterId") REFERENCES "Letter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "LetterRecipient" ADD CONSTRAINT "LetterRecipient_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "LetterTemplate" ADD CONSTRAINT "LetterTemplate_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
