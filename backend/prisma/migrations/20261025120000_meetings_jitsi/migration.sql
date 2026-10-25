-- Jitsi room + presence tracking
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "jitsiRoom" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Meeting_jitsiRoom_key" ON "Meeting"("jitsiRoom");

CREATE TABLE IF NOT EXISTS "MeetingAttendance" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MeetingAttendance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MeetingAttendance_meetingId_userId_idx" ON "MeetingAttendance"("meetingId", "userId");
CREATE INDEX IF NOT EXISTS "MeetingAttendance_userId_joinedAt_idx" ON "MeetingAttendance"("userId", "joinedAt");

DO $$ BEGIN
  ALTER TABLE "MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_meetingId_fkey"
    FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
