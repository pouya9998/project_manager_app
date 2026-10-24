-- Drop LiveKit attendance + room; use external meeting URL instead
DROP TABLE IF EXISTS "MeetingAttendance";
DROP INDEX IF EXISTS "Meeting_livekitRoom_key";

ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "meetingUrl" TEXT;
ALTER TABLE "Meeting" DROP COLUMN IF EXISTS "livekitRoom";
