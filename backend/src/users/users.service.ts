import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: { jobPosition: true },
      orderBy: { id: 'asc' },
    });
    return users.map(({ password, ...u }) => u);
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('این ایمیل قبلاً ثبت شده است');
    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password,
        fullName: dto.fullName,
        role: dto.role,
        jobPositionId: dto.jobPositionId,
      },
      include: { jobPosition: true },
    });
    const { password: _, ...safe } = user;
    return safe;
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    const data: any = {};
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.jobPositionId !== undefined) data.jobPositionId = dto.jobPositionId;
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data,
      include: { jobPosition: true },
    });
    const { password, ...safe } = updated;
    return safe;
  }

  /** Permanently delete a user (not soft-deactivate). */
  async remove(id: number, actor: { id: number; role: Role }) {
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException('فقط مدیر می‌تواند کاربر را حذف کند');
    }
    if (id === actor.id) {
      throw new BadRequestException('نمی‌توانید حساب خودتان را حذف کنید');
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    if (user.role === Role.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: { role: Role.ADMIN },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('حذف آخرین مدیر مجاز نیست');
      }
    }

    const actorId = actor.id;

    await this.prisma.$transaction(async (tx) => {
      // Required FKs without Cascade — reassign ownership to the acting admin
      await tx.task.updateMany({
        where: { creatorId: id },
        data: { creatorId: actorId },
      });
      await tx.chatRoom.updateMany({
        where: { creatorId: id },
        data: { creatorId: actorId },
      });
      await tx.chatMessage.updateMany({
        where: { senderId: id },
        data: { senderId: actorId },
      });
      await tx.effortLog.updateMany({
        where: { reviewerId: id },
        data: { reviewerId: null },
      });
      await tx.effortLog.deleteMany({ where: { userId: id } });
      await tx.taskComment.deleteMany({ where: { userId: id } });

      // Remaining relations cascade (assignees, memberships, receipts, …)
      await tx.user.delete({ where: { id } });
    });

    if (user.avatarFile) {
      try {
        await unlink(join(process.cwd(), 'uploads', 'avatars', user.avatarFile));
      } catch {
        /* ignore missing file */
      }
    }

    return { ok: true };
  }
}
