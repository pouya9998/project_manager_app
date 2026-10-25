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
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildJitsiJoinUrl,
  buildJitsiJwt,
  jitsiEnabled,
  jitsiPublicUrl,
  roomNameForMeeting,
} from './jitsi.util';

const userSelect = { id: true, fullName: true, email: true, avatarFile: true };

function normalizeMeetingUrl(raw?: string | null) {
  const url = (raw || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    throw new BadRequestException('لینک جلسه باید با http:// یا https:// شروع شود');
  }
  return url;
}

export type CreateMeetingInput = {
  title: string;
  description?: string;
  meetingUrl?: string;
  /** Prefer Jitsi room when stack is configured (default true if JITSI_PUBLIC_URL set) */
  useJitsi?: boolean;
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
    if (meeting.hostId !== userId) {
      throw new ForbiddenException('فقط میزبان می‌تواند این کار را انجام دهد');
    }
    return meeting;
  }

  config() {
    return {
      jitsiEnabled: jitsiEnabled(),
      jitsiPublicUrl: jitsiEnabled() ? jitsiPublicUrl() : null,
    };
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
    const online = await this.prisma.meetingAttendance.findMany({
      where: { meetingId: id, leftAt: null },
      include: { user: { select: userSelect } },
      orderBy: { joinedAt: 'asc' },
    });
    return {
      ...meeting,
      invitees,
      liveParticipants: online.length,
      online: online.map((r) => ({
        userId: r.userId,
        user: r.user,
        joinedAt: r.joinedAt,
      })),
      jitsiEnabled: jitsiEnabled(),
    };
  }

  async create(hostId: number, data: CreateMeetingInput) {
    const title = (data.title || '').trim();
    if (!title) throw new BadRequestException('عنوان جلسه الزامی است');

    const externalUrl = normalizeMeetingUrl(data.meetingUrl);
    const wantJitsi =
      data.useJitsi !== false && jitsiEnabled() && !externalUrl;

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

    let created = await this.prisma.meeting.create({
      data: {
        title,
        description: data.description?.trim() || null,
        meetingUrl: externalUrl,
        type: recurrence !== MeetingRecurrence.NONE ? MeetingType.RECURRING : type,
        status: startNow ? MeetingStatus.LIVE : MeetingStatus.SCHEDULED,
        recurrence,
        recurrenceUntil: data.recurrenceUntil ? new Date(data.recurrenceUntil) : null,
        startsAt,
        endsAt,
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

    if (wantJitsi) {
      const room = roomNameForMeeting(created.id);
      const url = `${jitsiPublicUrl()}/${room}`;
      created = await this.prisma.meeting.update({
        where: { id: created.id },
        data: { jitsiRoom: room, meetingUrl: url },
        include: {
          host: { select: userSelect },
          invitees: { include: { user: { select: userSelect } } },
          project: { select: { id: true, name: true } },
        },
      });
    }

    if (inviteeIds.length) {
      await this.notifications.notifyUsers(inviteeIds, {
        type: AppNotificationType.MEETING_INVITE,
        title: startNow ? 'جلسه در حال برگزاری' : 'دعوت به جلسه',
        body: `${created.host.fullName}: ${created.title}`,
        link: `/meetings/${created.id}`,
        meta: { meetingId: created.id },
      });
    }

    if (startNow && inviteeIds.length) {
      await this.notifications.notifyUsers(inviteeIds, {
        type: AppNotificationType.MEETING_STARTED,
        title: 'شروع جلسه',
        body: `جلسه «${created.title}» شروع شد`,
        link: `/meetings/${created.id}`,
        meta: { meetingId: created.id },
      });
    }

    return created;
  }

  async update(
    id: number,
    hostId: number,
    data: {
      title?: string;
      description?: string;
      meetingUrl?: string | null;
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
        meetingUrl:
          data.meetingUrl === undefined ? undefined : normalizeMeetingUrl(data.meetingUrl),
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
        endedAt: data.status === MeetingStatus.ENDED ? new Date() : undefined,
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

    let jitsiRoom = meeting.jitsiRoom;
    let meetingUrl = meeting.meetingUrl;
    if (!meetingUrl && jitsiEnabled()) {
      jitsiRoom = jitsiRoom || roomNameForMeeting(id);
      meetingUrl = `${jitsiPublicUrl()}/${jitsiRoom}`;
    }

    const updated = await this.prisma.meeting.update({
      where: { id },
      data: {
        status: MeetingStatus.LIVE,
        startedAt: meeting.startedAt || new Date(),
        jitsiRoom: jitsiRoom || undefined,
        meetingUrl: meetingUrl || undefined,
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
        link: `/meetings/${updated.id}`,
        meta: { meetingId: updated.id },
      });
    }
    return updated;
  }

  /** Open join URL + record presence (for Jitsi or external link). */
  async join(id: number, userId: number) {
    const meeting = await this.assertAccess(id, userId);
    if (meeting.status === MeetingStatus.CANCELLED) {
      throw new BadRequestException('جلسه لغو شده است');
    }
    if (meeting.status === MeetingStatus.ENDED) {
      throw new BadRequestException('جلسه پایان یافته است');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    let jitsiRoom = meeting.jitsiRoom;
    let meetingUrl = meeting.meetingUrl;

    if (!meetingUrl && jitsiEnabled()) {
      jitsiRoom = jitsiRoom || roomNameForMeeting(id);
      meetingUrl = `${jitsiPublicUrl()}/${jitsiRoom}`;
      await this.prisma.meeting.update({
        where: { id },
        data: {
          jitsiRoom,
          meetingUrl,
          status: meeting.status === MeetingStatus.SCHEDULED ? MeetingStatus.LIVE : undefined,
          startedAt: meeting.startedAt || new Date(),
        },
      });
    } else if (meeting.status === MeetingStatus.SCHEDULED) {
      await this.prisma.meeting.update({
        where: { id },
        data: { status: MeetingStatus.LIVE, startedAt: meeting.startedAt || new Date() },
      });
    }

    if (!meetingUrl) {
      throw new BadRequestException('لینک جلسه تنظیم نشده است');
    }

    const now = new Date();
    const open = await this.prisma.meetingAttendance.findMany({
      where: { meetingId: id, userId, leftAt: null },
    });
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

    let url = meetingUrl;
    if (jitsiRoom && jitsiEnabled() && meetingUrl.includes(jitsiPublicUrl() || '___none___')) {
      const jwt = buildJitsiJwt({
        room: jitsiRoom,
        userId,
        name: user.fullName,
        email: user.email,
        moderator: meeting.hostId === userId,
      });
      url = buildJitsiJoinUrl(jitsiRoom, user.fullName, jwt);
    }

    return {
      url,
      jitsiRoom: jitsiRoom || null,
      meetingId: id,
      title: meeting.title,
    };
  }

  async leave(id: number, userId: number) {
    await this.assertAccess(id, userId);
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
    return { ok: true };
  }

  async ensureJitsi(id: number, hostId: number) {
    await this.assertHost(id, hostId);
    if (!jitsiEnabled()) {
      throw new BadRequestException('جیتسی روی سرور پیکربندی نشده است (JITSI_PUBLIC_URL)');
    }
    const meeting = await this.prisma.meeting.findUnique({ where: { id } });
    if (!meeting) throw new NotFoundException('جلسه یافت نشد');
    if (meeting.jitsiRoom && meeting.meetingUrl) return meeting;

    const room = meeting.jitsiRoom || roomNameForMeeting(id);
    return this.prisma.meeting.update({
      where: { id },
      data: { jitsiRoom: room, meetingUrl: `${jitsiPublicUrl()}/${room}` },
      include: {
        host: { select: userSelect },
        invitees: { include: { user: { select: userSelect } } },
      },
    });
  }
}
