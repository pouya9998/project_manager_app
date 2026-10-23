-- Drop meetings feature
DROP TABLE IF EXISTS "MeetingAttendee" CASCADE;
DROP TABLE IF EXISTS "Meeting" CASCADE;
DROP TYPE IF EXISTS "MeetingStatus";

-- Clean notification rows that used MEETING type (enum value may remain unused)
DELETE FROM "AppNotification" WHERE "type"::text = 'MEETING';

UPDATE "AppSettings"
SET "tagline" = 'مدیریت وظایف، گفتگو و گیت‌لب'
WHERE "tagline" IS NULL OR "tagline" = 'مدیریت وظایف، گیت‌لب و جلسات';
