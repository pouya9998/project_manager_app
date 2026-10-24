import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppNotificationType, LetterStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const letterInclude = {
  sender: { select: { id: true, fullName: true, email: true, avatarFile: true } },
  recipients: {
    include: {
      user: { select: { id: true, fullName: true, email: true, avatarFile: true } },
    },
  },
} as const;

@Injectable()
export class LettersService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  applyTemplate(
    text: string,
    vars: Record<string, string>,
  ) {
    return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
  }

  async listInbox(userId: number) {
    return this.prisma.letter.findMany({
      where: {
        status: LetterStatus.SENT,
        recipients: { some: { userId } },
      },
      include: letterInclude,
      orderBy: { sentAt: 'desc' },
      take: 100,
    });
  }

  async listSent(userId: number) {
    return this.prisma.letter.findMany({
      where: { senderId: userId, status: LetterStatus.SENT },
      include: letterInclude,
      orderBy: { sentAt: 'desc' },
      take: 100,
    });
  }

  async listDrafts(userId: number) {
    return this.prisma.letter.findMany({
      where: { senderId: userId, status: LetterStatus.DRAFT },
      include: letterInclude,
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  async getOne(id: number, userId: number) {
    const letter = await this.prisma.letter.findUnique({
      where: { id },
      include: letterInclude,
    });
    if (!letter) throw new NotFoundException('نامه یافت نشد');
    const isSender = letter.senderId === userId;
    const isRecipient = letter.recipients.some((r) => r.userId === userId);
    if (!isSender && !isRecipient) throw new ForbiddenException();
    if (isRecipient && letter.status === LetterStatus.SENT) {
      await this.prisma.letterRecipient.updateMany({
        where: { letterId: id, userId, readAt: null },
        data: { readAt: new Date() },
      });
    }
    return this.prisma.letter.findUnique({ where: { id }, include: letterInclude });
  }

  async create(
    userId: number,
    data: { subject: string; body: string; recipientIds?: number[]; send?: boolean },
  ) {
    const subject = (data.subject || '').trim();
    const body = (data.body || '').trim();
    if (!subject || !body) throw new BadRequestException('موضوع و متن نامه الزامی است');

    const recipientIds = [...new Set((data.recipientIds || []).map(Number).filter((id) => id > 0 && id !== userId))];

    if (data.send && !recipientIds.length) {
      throw new BadRequestException('حداقل یک گیرنده انتخاب کنید');
    }

    const letter = await this.prisma.letter.create({
      data: {
        subject,
        body,
        senderId: userId,
        status: data.send ? LetterStatus.SENT : LetterStatus.DRAFT,
        sentAt: data.send ? new Date() : null,
        recipients: recipientIds.length
          ? { create: recipientIds.map((uid) => ({ userId: uid })) }
          : undefined,
      },
      include: letterInclude,
    });

    if (data.send) {
      await this.notifyRecipients(letter.id, userId, subject, recipientIds);
    }

    return letter;
  }

  async update(
    id: number,
    userId: number,
    data: { subject?: string; body?: string; recipientIds?: number[] },
  ) {
    const letter = await this.prisma.letter.findUnique({
      where: { id },
      include: { recipients: true },
    });
    if (!letter) throw new NotFoundException('نامه یافت نشد');
    if (letter.senderId !== userId) throw new ForbiddenException();
    if (letter.status !== LetterStatus.DRAFT) {
      throw new BadRequestException('فقط پیش‌نویس قابل ویرایش است');
    }

    if (data.recipientIds) {
      const recipientIds = [
        ...new Set(data.recipientIds.map(Number).filter((rid) => rid > 0 && rid !== userId)),
      ];
      await this.prisma.letterRecipient.deleteMany({ where: { letterId: id } });
      if (recipientIds.length) {
        await this.prisma.letterRecipient.createMany({
          data: recipientIds.map((uid) => ({ letterId: id, userId: uid })),
        });
      }
    }

    return this.prisma.letter.update({
      where: { id },
      data: {
        subject: data.subject?.trim(),
        body: data.body?.trim(),
      },
      include: letterInclude,
    });
  }

  async send(id: number, userId: number) {
    const letter = await this.prisma.letter.findUnique({
      where: { id },
      include: { recipients: true },
    });
    if (!letter) throw new NotFoundException('نامه یافت نشد');
    if (letter.senderId !== userId) throw new ForbiddenException();
    if (letter.status === LetterStatus.SENT) {
      throw new BadRequestException('این نامه قبلاً ارسال شده است');
    }
    if (!letter.recipients.length) {
      throw new BadRequestException('حداقل یک گیرنده لازم است');
    }

    const updated = await this.prisma.letter.update({
      where: { id },
      data: { status: LetterStatus.SENT, sentAt: new Date() },
      include: letterInclude,
    });

    await this.notifyRecipients(
      id,
      userId,
      letter.subject,
      letter.recipients.map((r) => r.userId),
    );

    return updated;
  }

  async remove(id: number, userId: number, role: Role) {
    const letter = await this.prisma.letter.findUnique({ where: { id } });
    if (!letter) throw new NotFoundException('نامه یافت نشد');
    if (letter.senderId !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException();
    }
    await this.prisma.letter.delete({ where: { id } });
    return { ok: true };
  }

  private async notifyRecipients(
    letterId: number,
    senderId: number,
    subject: string,
    recipientIds: number[],
  ) {
    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { fullName: true },
    });
    await this.notifications.notifyUsers(recipientIds, {
      type: AppNotificationType.LETTER_RECEIVED,
      title: 'نامه جدید',
      body: `${sender?.fullName || 'کاربر'}: ${subject}`.slice(0, 140),
      link: `/letters/${letterId}`,
      meta: { letterId },
    });
  }

  async listTemplates(userId: number) {
    return this.prisma.letterTemplate.findMany({
      where: {
        OR: [{ isShared: true }, { createdById: userId }],
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createTemplate(
    userId: number,
    data: { title: string; subject: string; body: string; isShared?: boolean },
  ) {
    const title = (data.title || '').trim();
    const subject = (data.subject || '').trim();
    const body = (data.body || '').trim();
    if (!title || !subject || !body) {
      throw new BadRequestException('عنوان، موضوع و متن قالب الزامی است');
    }
    return this.prisma.letterTemplate.create({
      data: {
        title,
        subject,
        body,
        createdById: userId,
        isShared: data.isShared !== false,
      },
    });
  }

  async deleteTemplate(id: number, userId: number, role: Role) {
    const tpl = await this.prisma.letterTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException('قالب یافت نشد');
    if (tpl.createdById !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException();
    }
    await this.prisma.letterTemplate.delete({ where: { id } });
    return { ok: true };
  }

  /** Build letter content from a template for a recipient (automation helper) */
  async previewFromTemplate(
    templateId: number,
    userId: number,
    recipientId?: number,
  ) {
    const tpl = await this.prisma.letterTemplate.findUnique({ where: { id: templateId } });
    if (!tpl) throw new NotFoundException('قالب یافت نشد');
    if (!tpl.isShared && tpl.createdById !== userId) throw new ForbiddenException();

    const [sender, recipient, settings] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      recipientId
        ? this.prisma.user.findUnique({ where: { id: recipientId } })
        : null,
      this.prisma.appSettings.findFirst(),
    ]);

    const vars = {
      fullName: recipient?.fullName || 'گیرنده',
      senderName: sender?.fullName || '',
      appName: settings?.appName || 'سامانه',
      date: new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Tehran',
      }).format(new Date()),
    };

    return {
      subject: this.applyTemplate(tpl.subject, vars),
      body: this.applyTemplate(tpl.body, vars),
      template: tpl,
    };
  }

  async sendFromTemplate(
    userId: number,
    data: { templateId: number; recipientIds: number[]; subject?: string; body?: string },
  ) {
    const recipientIds = [
      ...new Set((data.recipientIds || []).map(Number).filter((id) => id > 0 && id !== userId)),
    ];
    if (!recipientIds.length) {
      throw new BadRequestException('حداقل یک گیرنده انتخاب کنید');
    }

    // Personalize per first recipient for subject/body defaults; still one letter to many
    const preview = await this.previewFromTemplate(
      data.templateId,
      userId,
      recipientIds[0],
    );

    return this.create(userId, {
      subject: (data.subject || preview.subject).trim(),
      body: (data.body || preview.body).trim(),
      recipientIds,
      send: true,
    });
  }

  async unreadCount(userId: number) {
    return this.prisma.letterRecipient.count({
      where: {
        userId,
        readAt: null,
        letter: { status: LetterStatus.SENT },
      },
    });
  }
}
