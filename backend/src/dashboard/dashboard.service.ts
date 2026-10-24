import { Injectable } from '@nestjs/common';
import { EffortStatus, ProjectType, Role, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EngineeringService } from '../engineering/engineering.service';

const OPEN_STATUSES: TaskStatus[] = [
  TaskStatus.BACKLOG,
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.IN_REVIEW,
];

function tehranYmd(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Iran is UTC+03:30 year-round */
function dayStartTehran(ymd: string) {
  return new Date(`${ymd}T00:00:00+03:30`);
}

function dayEndTehran(ymd: string) {
  return new Date(`${ymd}T23:59:59.999+03:30`);
}

const taskCardSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  project: { select: { id: true, name: true } },
  assignees: {
    select: { user: { select: { id: true, fullName: true } } },
  },
} as const;

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private engineering: EngineeringService,
  ) {}

  async stats(user: { id: number; role: Role }) {
    const isAdmin = user.role === Role.ADMIN;
    const taskWhere: any = isAdmin
      ? {}
      : { assignees: { some: { userId: user.id } } };

    const today = tehranYmd();
    const tomorrow = addDaysYmd(today, 1);
    const in7 = addDaysYmd(today, 7);
    const in14 = addDaysYmd(today, 14);

    const todayStart = dayStartTehran(today);
    const todayEnd = dayEndTehran(today);
    const upcomingEnd = dayEndTehran(in7);
    const plannedEnd = dayEndTehran(in14);
    const tomorrowStart = dayStartTehran(tomorrow);

    const openWhere = {
      ...taskWhere,
      status: { in: OPEN_STATUSES },
      dueDate: { not: null },
    };

    const [
      tasks,
      byStatus,
      pendingEfforts,
      totalHours,
      softwareCount,
      dueToday,
      upcoming,
      overdue,
      planned,
    ] = await Promise.all([
      this.prisma.task.count({ where: taskWhere }),
      this.prisma.task.groupBy({
        by: ['status'],
        where: taskWhere,
        _count: true,
      }),
      this.prisma.effortLog.count({
        where: isAdmin
          ? { status: EffortStatus.PENDING }
          : { userId: user.id, status: EffortStatus.PENDING },
      }),
      this.prisma.effortLog.aggregate({
        where: isAdmin
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
      this.prisma.task.findMany({
        where: {
          ...openWhere,
          dueDate: { gte: todayStart, lte: todayEnd },
        },
        select: taskCardSelect,
        orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
        take: 30,
      }),
      this.prisma.task.findMany({
        where: {
          ...openWhere,
          dueDate: { gte: tomorrowStart, lte: upcomingEnd },
        },
        select: taskCardSelect,
        orderBy: [{ dueDate: 'asc' }, { priority: 'asc' }],
        take: 30,
      }),
      this.prisma.task.findMany({
        where: {
          ...openWhere,
          dueDate: { lt: todayStart },
        },
        select: taskCardSelect,
        orderBy: [{ dueDate: 'asc' }, { priority: 'asc' }],
        take: 30,
      }),
      this.prisma.task.findMany({
        where: {
          ...openWhere,
          dueDate: { gte: todayStart, lte: plannedEnd },
        },
        select: taskCardSelect,
        orderBy: [{ dueDate: 'asc' }, { priority: 'asc' }],
        take: 50,
      }),
    ]);

    const statusMap = Object.values(TaskStatus).reduce(
      (acc, s) => {
        acc[s] = byStatus.find((b) => b.status === s)?._count || 0;
        return acc;
      },
      {} as Record<string, number>,
    );

    const plannedByProjectMap = new Map<
      string,
      {
        projectId: number | null;
        projectName: string;
        tasks: typeof planned;
      }
    >();
    for (const t of planned) {
      const key = t.project?.id != null ? String(t.project.id) : 'none';
      const name = t.project?.name || 'بدون پروژه';
      if (!plannedByProjectMap.has(key)) {
        plannedByProjectMap.set(key, {
          projectId: t.project?.id ?? null,
          projectName: name,
          tasks: [],
        });
      }
      plannedByProjectMap.get(key)!.tasks.push(t);
    }

    let engineering: any = null;
    if (isAdmin && softwareCount > 0) {
      engineering = await this.engineering.softwareDashboard({ days: 30 });
    }

    return {
      tasks,
      byStatus: statusMap,
      pendingEfforts,
      approvedHours: totalHours._sum.approvedHours || 0,
      softwareProjects: softwareCount,
      engineering,
      agenda: {
        todayYmd: today,
        dueToday,
        upcoming,
        overdue,
        plannedByProject: [...plannedByProjectMap.values()],
      },
    };
  }
}
