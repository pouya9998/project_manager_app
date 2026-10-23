-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('TEXT', 'VOICE', 'FILE', 'IMAGE');

-- CreateTable
CREATE TABLE "ChatRoom" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'گفتگوی عمومی',
    "isGlobal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "senderId" INTEGER NOT NULL,
    "type" "ChatMessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "originalName" TEXT,
    "storedName" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "durationSec" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatRoom_projectId_idx" ON "ChatRoom"("projectId");

-- CreateIndex
CREATE INDEX "ChatMessage_roomId_createdAt_idx" ON "ChatMessage"("roomId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill global chat rooms for existing projects
INSERT INTO "ChatRoom" ("projectId", "name", "isGlobal", "updatedAt", "createdAt")
SELECT p."id", 'گفتگوی عمومی', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Project" p
WHERE NOT EXISTS (
  SELECT 1 FROM "ChatRoom" c WHERE c."projectId" = p."id" AND c."isGlobal" = true
);
