import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePositionDto } from './dto/create-position.dto';

@Injectable()
export class PositionsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.jobPosition.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { id: 'asc' },
    });
  }

  create(dto: CreatePositionDto) {
    return this.prisma.jobPosition.create({ data: dto });
  }

  async update(id: number, dto: CreatePositionDto) {
    await this.ensure(id);
    return this.prisma.jobPosition.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.ensure(id);
    await this.prisma.user.updateMany({
      where: { jobPositionId: id },
      data: { jobPositionId: null },
    });
    return this.prisma.jobPosition.delete({ where: { id } });
  }

  private async ensure(id: number) {
    const p = await this.prisma.jobPosition.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('سمت شغلی یافت نشد');
  }
}
