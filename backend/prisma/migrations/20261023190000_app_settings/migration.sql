-- CreateTable
CREATE TABLE "AppSettings" (
    "id" SERIAL NOT NULL,
    "appName" TEXT NOT NULL DEFAULT 'سامانه مدیریت پروژه',
    "tagline" TEXT DEFAULT 'مدیریت وظایف، گیت‌لب و جلسات',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AppSettings" ("appName", "tagline", "updatedAt", "createdAt")
VALUES ('سامانه مدیریت پروژه', 'مدیریت وظایف، گیت‌لب و جلسات', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
