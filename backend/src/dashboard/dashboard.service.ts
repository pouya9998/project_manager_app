import { Injectable } from '@nestjs/common';
import { EffortStatus, ProjectType, Role, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EngineeringService } from '../engineering/engineering.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private engineering: EngineeringService,
  ) {}

  async stats(user: { id: number; role: Role }) {
    const taskWhere =
      user.role === Role.ADMIN
        ? {}
        : { assignees: { some: { userId: user.id } } };

    const [tasks, byStatus, pendingEfforts, totalHours, softwareCount] = await Promise.all([
      this.prisma.task.count({ where: taskWhere }),
      this.prisma.task.groupBy({
        by: ['status'],
        where: taskWhere,
        _count: true,
      }),
      this.prisma.effortLog.count({
        where:
          user.role === Role.ADMIN
            ? { status: EffortStatus.PENDING }
            : { userId: user.id, status: EffortStatus.PENDING },
      }),
      this.prisma.effortLog.aggregate({
        where:
          user.role === Role.ADMIN
            ? { status: { in: [EffortStatus.APPROVED, EffortStatus.ADJUSTED] } }
            : {
                userId: user.id,
                status: { in: [EffortStatus.APPROVED, EffortStatus.ADJUSTED] },
              },
        _sum: { approvedHours: true },
      }),
      this.prisma.project.count({
        where: { type: ProjectType.SOFTWARE, isActive: true },
      }),
    ]);

    const statusMap = Object.values(TaskStatus).reduce(
      (acc, s) => {
        acc[s] = byStatus.find((b) => b.status === s)?._count || 0;
        return acc;
      },
      {} as Record<string, number>,
    );

    let engineering: any = null;
    if (user.role === Role.ADMIN && softwareCount > 0) {
      engineering = await this.engineering.softwareDashboard({ days: 30 });
    }

    return {
      tasks,
      byStatus: statusMap,
      pendingEfforts,
      approvedHours: totalHours._sum.approvedHours || 0,
      softwareProjects: softwareCount,
      engineering,
    };
  }
}
