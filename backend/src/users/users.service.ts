import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
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
    const data: any = { ...dto };
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

  async remove(id: number) {
    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
    return { ok: true };
  }
}
