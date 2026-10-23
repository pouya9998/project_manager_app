import { BadRequestException, Injectable } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get() {
    let settings = await this.prisma.appSettings.findFirst({ orderBy: { id: 'asc' } });
    if (!settings) {
      settings = await this.prisma.appSettings.create({
        data: {
          appName: 'سامانه مدیریت پروژه',
          tagline: 'مدیریت وظایف، گیت‌لب و جلسات',
          primaryColor: '#0f6e56',
        },
      });
    }
    return settings;
  }

  async update(dto: UpdateSettingsDto) {
    const current = await this.get();
    return this.prisma.appSettings.update({
      where: { id: current.id },
      data: {
        appName: dto.appName ?? current.appName,
        tagline: dto.tagline !== undefined ? dto.tagline : current.tagline,
        primaryColor: dto.primaryColor ?? current.primaryColor,
      },
    });
  }

  async setLogo(file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('فایل لوگو ارسال نشده است');
    const current = await this.get();
    if (current.logoFile) {
      try {
        await unlink(join(process.cwd(), 'uploads', 'branding', current.logoFile));
      } catch {
        /* ignore missing old file */
      }
    }
    return this.prisma.appSettings.update({
      where: { id: current.id },
      data: { logoFile: file.filename },
    });
  }
}
