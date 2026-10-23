import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function ensurePosition(title: string, description: string) {
  const existing = await prisma.jobPosition.findFirst({ where: { title } });
  if (existing) return existing;
  return prisma.jobPosition.create({ data: { title, description } });
}

async function main() {
  const existingSettings = await prisma.appSettings.findFirst();
  if (!existingSettings) {
    await prisma.appSettings.create({
      data: {
        appName: 'سامانه مدیریت پروژه',
        tagline: 'مدیریت وظایف، گیت‌لب و جلسات',
      },
    });
  }

  const manager = await ensurePosition('مدیر پروژه', 'مدیریت پروژه‌ها و تیم');
  const backend = await ensurePosition('توسعه‌دهنده بک‌اند', 'توسعه سمت سرور');
  const frontend = await ensurePosition('توسعه‌دهنده فرانت‌اند', 'توسعه رابط کاربری');
  await ensurePosition('تستر نرم‌افزار', 'تست و تضمین کیفیت');

  const password = await bcrypt.hash('Admin@123', 10);
  const userPassword = await bcrypt.hash('User@123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@pmo.local' },
    update: {},
    create: {
      email: 'admin@pmo.local',
      password,
      fullName: 'مدیر سیستم',
      role: Role.ADMIN,
      jobPositionId: manager.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'dev@pmo.local' },
    update: {},
    create: {
      email: 'dev@pmo.local',
      password: userPassword,
      fullName: 'علی رضایی',
      role: Role.USER,
      jobPositionId: backend.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'frontend@pmo.local' },
    update: {},
    create: {
      email: 'frontend@pmo.local',
      password: userPassword,
      fullName: 'سارا محمدی',
      role: Role.USER,
      jobPositionId: frontend.id,
    },
  });

  console.log('Seed completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
