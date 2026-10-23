-- Drop old project-bound chat
DROP TABLE IF EXISTS "ChatMessage" CASCADE;
DROP TABLE IF EXISTS "ChatRoom" CASCADE;

-- CreateEnum
CREATE TYPE "ChatRoomType" AS ENUM ('DIRECT', 'GROUP');
CREATE TYPE "ChatMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "ChatMentionType" AS ENUM ('USER', 'TASK', 'PROJECT');
CREATE TYPE "AppNotificationType" AS ENUM ('CHAT_MESSAGE', 'TASK_ASSIGNED', 'TASK_MENTION', 'MEETING', 'SYSTEM', 'POLL');

-- AlterEnum ChatMessageType - recreate with new values
ALTER TYPE "ChatMessageType" ADD VALUE IF NOT EXISTS 'POLL';
ALTER TYPE "ChatMessageType" ADD VALUE IF NOT EXISTS 'SYSTEM';

-- CreateTable
CREATE TABLE "ChatRoom" (
    "id" SERIAL NOT NULL,
    "type" "ChatRoomType" NOT NULL DEFAULT 'GROUP',
    "name" TEXT,
    "description" TEXT,
    "avatarFile" TEXT,
    "creatorId" INTEGER NOT NULL,
    "directKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatRoomMember" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "ChatMemberRole" NOT NULL DEFAULT 'MEMBER',
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "lastReadAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatRoomMember_pkey" PRIMARY KEY ("id")
);

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
    "replyToId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMessageReceipt" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "ChatMessageReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMessageMention" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "type" "ChatMentionType" NOT NULL,
    "refId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    CONSTRAINT "ChatMessageMention_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatPoll" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "multipleChoice" BOOLEAN NOT NULL DEFAULT false,
    "closesAt" TIMESTAMP(3),
    CONSTRAINT "ChatPoll_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatPollOption" (
    "id" SERIAL NOT NULL,
    "pollId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ChatPollOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatPollVote" (
    "id" SERIAL NOT NULL,
    "optionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatPollVote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppNotification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "AppNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "meta" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PushSubscription" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatRoom_directKey_key" ON "ChatRoom"("directKey");
CREATE UNIQUE INDEX "ChatRoomMember_roomId_userId_key" ON "ChatRoomMember"("roomId", "userId");
CREATE UNIQUE INDEX "ChatMessageReceipt_messageId_userId_key" ON "ChatMessageReceipt"("messageId", "userId");
CREATE UNIQUE INDEX "ChatPoll_messageId_key" ON "ChatPoll"("messageId");
CREATE UNIQUE INDEX "ChatPollVote_optionId_userId_key" ON "ChatPollVote"("optionId", "userId");
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "ChatMessage_roomId_createdAt_idx" ON "ChatMessage"("roomId", "createdAt");
CREATE INDEX "AppNotification_userId_createdAt_idx" ON "AppNotification"("userId", "createdAt");

ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatRoomMember" ADD CONSTRAINT "ChatRoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatRoomMember" ADD CONSTRAINT "ChatRoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatMessageReceipt" ADD CONSTRAINT "ChatMessageReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageReceipt" ADD CONSTRAINT "ChatMessageReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageMention" ADD CONSTRAINT "ChatMessageMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatPoll" ADD CONSTRAINT "ChatPoll_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatPollOption" ADD CONSTRAINT "ChatPollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "ChatPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatPollVote" ADD CONSTRAINT "ChatPollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ChatPollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatPollVote" ADD CONSTRAINT "ChatPollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
