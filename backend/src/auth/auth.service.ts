import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { jobPosition: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است');
    }
    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) {
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است');
    }
    const token = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const { password, ...safe } = user;
    return { accessToken: token, user: safe };
  }

  async me(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { jobPosition: true },
    });
    if (!user) throw new UnauthorizedException();
    const { password, ...safe } = user;
    return safe;
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName,
        statusMessage: dto.statusMessage === undefined ? undefined : dto.statusMessage || null,
      },
      include: { jobPosition: true },
    });
    const { password, ...safe } = updated;
    return safe;
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const ok = await bcrypt.compare(dto.currentPassword, user.password);
    if (!ok) throw new BadRequestException('رمز فعلی نادرست است');
    const password = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { password } });
    return { ok: true };
  }

  async setAvatar(userId: number, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('فایل تصویر ارسال نشده است');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.avatarFile) {
      try {
        await unlink(join(process.cwd(), 'uploads', 'avatars', user.avatarFile));
      } catch {
        /* ignore */
      }
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarFile: file.filename },
      include: { jobPosition: true },
    });
    const { password, ...safe } = updated;
    return safe;
  }
}
