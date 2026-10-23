import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EffortStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEffortDto } from './dto/create-effort.dto';
import { ReviewEffortDto } from './dto/review-effort.dto';

@Injectable()
export class EffortsService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: { id: number; role: Role }, status?: EffortStatus) {
    const where: any = {};
    if (status) where.status = status;
    if (user.role !== Role.ADMIN) where.userId = user.id;
    return this.prisma.effortLog.findMany({
      where,
      include: {
        task: { select: { id: true, title: true, status: true } },
        user: { select: { id: true, fullName: true } },
        reviewer: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateEffortDto, userId: number) {
    const task = await this.prisma.task.findUnique({
      where: { id: dto.taskId },
      include: { assignees: true },
    });
    if (!task) throw new NotFoundException('وظیفه یافت نشد');
    const assigned = task.assignees.some((a) => a.userId === userId);
    if (!assigned) {
      throw new ForbiddenException('فقط مسئولان وظیفه می‌توانند زمان ثبت کنند');
    }
    return this.prisma.effortLog.create({
      data: {
        taskId: dto.taskId,
        userId,
        hours: dto.hours,
        description: dto.description,
        workDate: dto.workDate ? new Date(dto.workDate) : new Date(),
      },
      include: {
        task: { select: { id: true, title: true } },
        user: { select: { id: true, fullName: true } },
      },
    });
  }

  async review(id: number, dto: ReviewEffortDto, reviewerId: number) {
    const effort = await this.prisma.effortLog.findUnique({ where: { id } });
    if (!effort) throw new NotFoundException('ثبت زمان یافت نشد');

    const approvedHours =
      dto.status === EffortStatus.APPROVED
        ? dto.approvedHours ?? effort.hours
        : dto.status === EffortStatus.ADJUSTED
          ? dto.approvedHours ?? effort.hours
          : null;

    return this.prisma.effortLog.update({
      where: { id },
      data: {
        status: dto.status,
        approvedHours: approvedHours ?? undefined,
        reviewNote: dto.reviewNote,
        reviewerId,
      },
      include: {
        task: { select: { id: true, title: true } },
        user: { select: { id: true, fullName: true } },
        reviewer: { select: { id: true, fullName: true } },
      },
    });
  }
}
