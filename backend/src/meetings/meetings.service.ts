import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppNotificationType,
  MeetingInviteeRole,
  MeetingRecurrence,
  MeetingStatus,
  MeetingType,
} from '@prisma/client';
import { AccessToken } from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const userSelect = { id: true, fullName: true, email: true, avatarFile: true };

export type CreateMeetingInput = {
  title: string;
  description?: string;
  type?: MeetingType;
  startsAt?: string;
  endsAt?: string;
  recurrence?: MeetingRecurrence;
  recurrenceUntil?: string;
  inviteeIds?: number[];
  projectId?: number | null;
  startNow?: boolean;
};

@Injectable()
export class MeetingsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private apiKey() {
    return process.env.LIVEKIT_API_KEY || 'devkey';
  }

  private apiSecret() {
    return process.env.LIVEKIT_API_SECRET || 'secret';
  }

  private publicUrl() {
    return process.env.LIVEKIT_PUBLIC_URL || 'ws://localhost:7880';
  }

  private async assertAccess(meetingId: number, userId: number) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        invitees: true,
        host: { select: userSelect },
        project: { select: { id: true, name: true } },
      },
    });
    if (!meeting) throw new NotFoundException('جلسه یافت نشد');
    const allowed =
      meeting.hostId === userId || meeting.invitees.some((i) => i.userId === userId);
    if (!allowed) throw new ForbiddenException('به این جلسه دسترسی ندارید');
    return meeting;
  }

  private async assertHost(meetingId: number, userId: number) {
    const meeting = await this.assertAccess(meetingId, userId);
    if (meeting.hostId !== userId) throw new ForbiddenException('فقط میزبان می‌تواند این کار را انجام دهد');
    return meeting;
  }

  async calendar(userId: number, from?: string, to?: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 86400000);
    const toDate = to ? new Date(to) : new Date(Date.now() + 60 * 86400000);
    return this.prisma.meeting.findMany({
      where: {
        status: { not: MeetingStatus.CANCELLED },
        startsAt: { gte: fromDate, lte: toDate },
        OR: [{ hostId: userId }, { invitees: { some: { userId } } }],
      },
      orderBy: { startsAt: 'asc' },
      include: {
        host: { select: userSelect },
        invitees: { include: { user: { select: userSelect } } },
        project: { select: { id: true, name: true } },
        _count: { select: { attendance: true } },
      },
    });
  }

  async getOne(id: number, userId: number) {
    const meeting = await this.assertAccess(id, userId);
    const invitees = await this.prisma.meetingInvitee.findMany({
      where: { meetingId: id },
      include: { user: { select: userSelect } },
    });
    const openAttendance = await this.prisma.meetingAttendance.count({
      where: { meetingId: id, leftAt: null },
    });
    return { ...meeting, invitees, liveParticipants: openAttendance };
  }

  async create(hostId: number, data: CreateMeetingInput) {
    const title = (data.title || '').trim();
    if (!title) throw new BadRequestException('عنوان جلسه الزامی است');

    const type = data.type || (data.startNow ? MeetingType.INSTANT : MeetingType.SCHEDULED);
    const recurrence = data.recurrence || MeetingRecurrence.NONE;
    const now = new Date();
    const startsAt = data.startsAt ? new Date(data.startsAt) : now;
    const endsAt = data.endsAt
      ? new Date(data.endsAt)
      : new Date(startsAt.getTime() + 60 * 60 * 1000);

    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('زمان شروع نامعتبر است');

    const inviteeIds = [...new Set((data.inviteeIds || []).filter((id) => id !== hostId))];
    const startNow = !!data.startNow || type === MeetingType.INSTANT;

    const meeting = await this.prisma.meeting.create({
      data: {
        title,
        description: data.description?.trim() || null,
        type: recurrence !== MeetingRecurrence.NONE ? MeetingType.RECURRING : type,
        status: startNow ? MeetingStatus.LIVE : MeetingStatus.SCHEDULED,
        recurrence,
        recurrenceUntil: data.recurrenceUntil ? new Date(data.recurrenceUntil) : null,
        startsAt,
        endsAt,
        livekitRoom: `pmo-meet-tmp-${Date.now()}`,
        hostId,
        projectId: data.projectId || null,
        startedAt: startNow ? now : null,
        invitees: {
          create: [
            { userId: hostId, role: MeetingInviteeRole.HOST },
            ...inviteeIds.map((userId) => ({
              userId,
              role: MeetingInviteeRole.PARTICIPANT,
            })),
          ],
        },
      },
      include: {
        host: { select: userSelect },
        invitees: { include: { user: { select: userSelect } } },
        project: { select: { id: true, name: true } },
      },
    });

    const updated = await this.prisma.meeting.update({
      where: { id: meeting.id },
      data: { livekitRoom: `pmo-meet-${meeting.id}` },
      include: {
        host: { select: userSelect },
        invitees: { include: { user: { select: userSelect } } },
        project: { select: { id: true, name: true } },
      },
    });

    if (inviteeIds.length) {
      await this.notifications.notifyUsers(inviteeIds, {
        type: AppNotificationType.MEETING_INVITE,
        title: startNow ? 'جلسه در حال برگزاری' : 'دعوت به جلسه',
        body: `${updated.host.fullName}: ${updated.title}`,
        link: `/meetings/${updated.id}`,
        meta: { meetingId: updated.id },
      });
    }

    if (startNow && inviteeIds.length) {
      await this.notifications.notifyUsers(inviteeIds, {
        type: AppNotificationType.MEETING_STARTED,
        title: 'شروع جلسه',
        body: `جلسه «${updated.title}» شروع شد`,
        link: `/meetings/${updated.id}/room`,
        meta: { meetingId: updated.id },
      });
    }

    return updated;
  }

  async update(
    id: number,
    hostId: number,
    data: {
      title?: string;
      description?: string;
      startsAt?: string;
      endsAt?: string;
      inviteeIds?: number[];
      status?: MeetingStatus;
      recurrence?: MeetingRecurrence;
      recurrenceUntil?: string | null;
      projectId?: number | null;
    },
  ) {
    await this.assertHost(id, hostId);
    const inviteeIds = data.inviteeIds
      ? [...new Set(data.inviteeIds.filter((uid) => uid !== hostId))]
      : null;

    if (inviteeIds) {
      await this.prisma.meetingInvitee.deleteMany({
        where: { meetingId: id, role: MeetingInviteeRole.PARTICIPANT },
      });
      if (inviteeIds.length) {
        await this.prisma.meetingInvitee.createMany({
          data: inviteeIds.map((userId) => ({
            meetingId: id,
            userId,
            role: MeetingInviteeRole.PARTICIPANT,
          })),
          skipDuplicates: true,
        });
      }
    }

    return this.prisma.meeting.update({
      where: { id },
      data: {
        title: data.title?.trim(),
        description: data.description === undefined ? undefined : data.description?.trim() || null,
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
        endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
        status: data.status,
        recurrence: data.recurrence,
        recurrenceUntil:
          data.recurrenceUntil === undefined
            ? undefined
            : data.recurrenceUntil
              ? new Date(data.recurrenceUntil)
              : null,
        projectId: data.projectId === undefined ? undefined : data.projectId,
      },
      include: {
        host: { select: userSelect },
        invitees: { include: { user: { select: userSelect } } },
        project: { select: { id: true, name: true } },
      },
    });
  }

  async start(id: number, hostId: number) {
    const meeting = await this.assertHost(id, hostId);
    if (meeting.status === MeetingStatus.CANCELLED) {
      throw new BadRequestException('جلسه لغو شده است');
    }
    if (meeting.status === MeetingStatus.ENDED) {
      throw new BadRequestException('جلسه پایان یافته است');
    }
    const updated = await this.prisma.meeting.update({
      where: { id },
      data: {
        status: MeetingStatus.LIVE,
        startedAt: meeting.startedAt || new Date(),
      },
      include: {
        host: { select: userSelect },
        invitees: { include: { user: { select: userSelect } } },
      },
    });

    const others = updated.invitees
      .filter((i) => i.userId !== hostId)
      .map((i) => i.userId);
    if (others.length) {
      await this.notifications.notifyUsers(others, {
        type: AppNotificationType.MEETING_STARTED,
        title: 'شروع جلسه',
        body: `جلسه «${updated.title}» شروع شد`,
        link: `/meetings/${updated.id}/room`,
        meta: { meetingId: updated.id },
      });
    }
    return updated;
  }

  async joinToken(id: number, userId: number) {
    const meeting = await this.assertAccess(id, userId);
    if (meeting.status === MeetingStatus.CANCELLED) {
      throw new BadRequestException('جلسه لغو شده است');
    }
    if (meeting.status === MeetingStatus.ENDED) {
      throw new BadRequestException('جلسه پایان یافته است');
    }

    if (meeting.status === MeetingStatus.SCHEDULED) {
      // Allow early join within 15 minutes, or host anytime
      const early = meeting.startsAt.getTime() - Date.now() <= 15 * 60 * 1000;
      if (meeting.hostId !== userId && !early) {
        throw new BadRequestException('هنوز زمان شروع جلسه نرسیده است');
      }
      await this.prisma.meeting.update({
        where: { id },
        data: { status: MeetingStatus.LIVE, startedAt: meeting.startedAt || new Date() },
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    // Close any dangling open segments for this user/meeting, then open a new one
    const open = await this.prisma.meetingAttendance.findMany({
      where: { meetingId: id, userId, leftAt: null },
    });
    const now = new Date();
    for (const row of open) {
      const durationSec =
        row.durationSec + Math.max(0, Math.floor((now.getTime() - row.joinedAt.getTime()) / 1000));
      await this.prisma.meetingAttendance.update({
        where: { id: row.id },
        data: { leftAt: now, durationSec },
      });
    }
    await this.prisma.meetingAttendance.create({
      data: { meetingId: id, userId, joinedAt: now },
    });

    const at = new AccessToken(this.apiKey(), this.apiSecret(), {
      identity: String(userId),
      name: user.fullName,
      ttl: '6h',
      metadata: JSON.stringify({ meetingId: id, role: meeting.hostId === userId ? 'HOST' : 'PARTICIPANT' }),
    });
    at.addGrant({
      roomJoin: true,
      room: meeting.livekitRoom,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    return {
      token,
      url: this.publicUrl(),
      roomName: meeting.livekitRoom,
      meetingId: id,
      isHost: meeting.hostId === userId,
      title: meeting.title,
    };
  }

  async leave(id: number, userId: number) {
    await this.assertAccess(id, userId);
    const open = await this.prisma.meetingAttendance.findMany({
      where: { meetingId: id, userId, leftAt: null },
      orderBy: { joinedAt: 'desc' },
    });
    const now = new Date();
    for (const row of open) {
      const durationSec =
        row.durationSec + Math.max(0, Math.floor((now.getTime() - row.joinedAt.getTime()) / 1000));
      await this.prisma.meetingAttendance.update({
        where: { id: row.id },
        data: { leftAt: now, durationSec },
      });
    }
    return { ok: true };
  }

  async end(id: number, hostId: number) {
    await this.assertHost(id, hostId);
    const now = new Date();
    const open = await this.prisma.meetingAttendance.findMany({
      where: { meetingId: id, leftAt: null },
    });
    for (const row of open) {
      const durationSec =
        row.durationSec + Math.max(0, Math.floor((now.getTime() - row.joinedAt.getTime()) / 1000));
      await this.prisma.meetingAttendance.update({
        where: { id: row.id },
        data: { leftAt: now, durationSec },
      });
    }
    return this.prisma.meeting.update({
      where: { id },
      data: { status: MeetingStatus.ENDED, endedAt: now },
      include: {
        host: { select: userSelect },
        invitees: { include: { user: { select: userSelect } } },
      },
    });
  }

  async stats(id: number, userId: number) {
    await this.assertAccess(id, userId);
    const rows = await this.prisma.meetingAttendance.findMany({
      where: { meetingId: id },
      include: { user: { select: userSelect } },
      orderBy: { joinedAt: 'asc' },
    });

    const byUser = new Map<
      number,
      {
        user: (typeof rows)[0]['user'];
        joinedAt: Date;
        leftAt: Date | null;
        durationSec: number;
        sessions: number;
      }
    >();

    for (const row of rows) {
      const prev = byUser.get(row.userId);
      const openExtra =
        !row.leftAt && row.joinedAt
          ? Math.max(0, Math.floor((Date.now() - row.joinedAt.getTime()) / 1000))
          : 0;
      const durationSec = row.durationSec + openExtra;
      if (!prev) {
        byUser.set(row.userId, {
          user: row.user,
          joinedAt: row.joinedAt,
          leftAt: row.leftAt,
          durationSec,
          sessions: 1,
        });
      } else {
        prev.durationSec += durationSec;
        prev.sessions += 1;
        if (row.joinedAt < prev.joinedAt) prev.joinedAt = row.joinedAt;
        if (row.leftAt && (!prev.leftAt || row.leftAt > prev.leftAt)) prev.leftAt = row.leftAt;
        if (!row.leftAt) prev.leftAt = null;
      }
    }

    const participants = [...byUser.values()].sort((a, b) => b.durationSec - a.durationSec);
    const totalDurationSec = participants.reduce((s, p) => s + p.durationSec, 0);
    return {
      participants,
      totalDurationSec,
      avgDurationSec: participants.length
        ? Math.round(totalDurationSec / participants.length)
        : 0,
      uniqueParticipants: participants.length,
    };
  }
}
