import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppNotificationType,
  ChatMemberRole,
  ChatMentionType,
  ChatMessageType,
  ChatRoomType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const senderSelect = { id: true, fullName: true, email: true, avatarFile: true };

const messageInclude = {
  sender: { select: senderSelect },
  replyTo: {
    include: { sender: { select: senderSelect } },
  },
  mentions: true,
  receipts: {
    include: { user: { select: senderSelect } },
  },
  poll: {
    include: {
      options: {
        orderBy: { order: 'asc' as const },
        include: {
          votes: { include: { user: { select: senderSelect } } },
        },
      },
    },
  },
};

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private directKey(a: number, b: number) {
    return [a, b].sort((x, y) => x - y).join(':');
  }

  async listRooms(userId: number) {
    const memberships = await this.prisma.chatRoomMember.findMany({
      where: { userId },
      include: {
        room: {
          include: {
            members: {
              include: { user: { select: senderSelect } },
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: { sender: { select: senderSelect } },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const rooms = await Promise.all(
      memberships.map(async (m) => {
        const unread = await this.prisma.chatMessage.count({
          where: {
            roomId: m.roomId,
            senderId: { not: userId },
            createdAt: m.lastReadAt ? { gt: m.lastReadAt } : undefined,
          },
        });
        return {
          ...m.room,
          myRole: m.role,
          unread,
          lastMessage: m.room.messages[0] || null,
          title: this.roomTitle(m.room, userId),
        };
      }),
    );

    return rooms.sort((a, b) => {
      const at = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bt = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bt - at;
    });
  }

  roomTitle(room: any, viewerId: number) {
    if (room.type === ChatRoomType.DIRECT) {
      const other = room.members?.find((m: any) => m.userId !== viewerId)?.user;
      return other?.fullName || 'پیام خصوصی';
    }
    return room.name || 'گروه بدون نام';
  }

  async assertMember(roomId: number, userId: number) {
    const member = await this.prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!member) throw new ForbiddenException('شما عضو این گفتگو نیستید');
    return member;
  }

  async createGroup(
    creatorId: number,
    data: { name: string; description?: string; memberIds?: number[] },
  ) {
    if (!data.name?.trim()) throw new BadRequestException('نام گروه الزامی است');
    const memberIds = [...new Set([creatorId, ...(data.memberIds || [])])];

    const room = await this.prisma.chatRoom.create({
      data: {
        type: ChatRoomType.GROUP,
        name: data.name.trim(),
        description: data.description,
        creatorId,
        members: {
          create: memberIds.map((userId) => ({
            userId,
            role: userId === creatorId ? ChatMemberRole.OWNER : ChatMemberRole.MEMBER,
          })),
        },
        messages: {
          create: {
            senderId: creatorId,
            type: ChatMessageType.SYSTEM,
            content: 'گروه ایجاد شد',
          },
        },
      },
      include: {
        members: { include: { user: { select: senderSelect } } },
      },
    });

    await this.notifications.notifyUsers(
      memberIds.filter((id) => id !== creatorId),
      {
        type: AppNotificationType.CHAT_MESSAGE,
        title: 'عضویت در گروه جدید',
        body: `به گروه «${room.name}» اضافه شدید`,
        link: `/chat/${room.id}`,
      },
    );

    return { ...room, title: room.name };
  }

  async openDirect(userId: number, otherUserId: number) {
    if (userId === otherUserId) {
      throw new BadRequestException('نمی‌توانید با خودتان گفتگو کنید');
    }
    const other = await this.prisma.user.findUnique({ where: { id: otherUserId } });
    if (!other || !other.isActive) throw new NotFoundException('کاربر یافت نشد');

    const key = this.directKey(userId, otherUserId);
    let room = await this.prisma.chatRoom.findUnique({
      where: { directKey: key },
      include: { members: { include: { user: { select: senderSelect } } } },
    });

    if (!room) {
      room = await this.prisma.chatRoom.create({
        data: {
          type: ChatRoomType.DIRECT,
          creatorId: userId,
          directKey: key,
          members: {
            create: [
              { userId, role: ChatMemberRole.MEMBER },
              { userId: otherUserId, role: ChatMemberRole.MEMBER },
            ],
          },
        },
        include: { members: { include: { user: { select: senderSelect } } } },
      });
    }

    return { ...room, title: this.roomTitle(room, userId) };
  }

  async addMembers(roomId: number, actorId: number, memberIds: number[]) {
    const actor = await this.assertMember(roomId, actorId);
    if (actor.role === ChatMemberRole.MEMBER) {
      throw new ForbiddenException('فقط مدیران گروه می‌توانند عضو اضافه کنند');
    }
    const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room || room.type !== ChatRoomType.GROUP) {
      throw new BadRequestException('فقط به گروه‌ها می‌توان عضو اضافه کرد');
    }

    const unique = [...new Set(memberIds)];
    for (const userId of unique) {
      await this.prisma.chatRoomMember.upsert({
        where: { roomId_userId: { roomId, userId } },
        update: {},
        create: { roomId, userId, role: ChatMemberRole.MEMBER },
      });
    }

    await this.notifications.notifyUsers(unique.filter((id) => id !== actorId), {
      type: AppNotificationType.CHAT_MESSAGE,
      title: 'عضویت در گروه',
      body: `به گروه «${room.name}» اضافه شدید`,
      link: `/chat/${roomId}`,
    });

    return this.getRoom(roomId, actorId);
  }

  async getRoom(roomId: number, userId: number) {
    const member = await this.assertMember(roomId, userId);
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        members: { include: { user: { select: { ...senderSelect, jobPosition: true } } } },
      },
    });
    if (!room) throw new NotFoundException('گفتگو یافت نشد');
    return { ...room, title: this.roomTitle(room, userId), myRole: member.role };
  }

  async getMessages(roomId: number, userId: number, beforeId?: number) {
    await this.assertMember(roomId, userId);
    const messages = await this.prisma.chatMessage.findMany({
      where: {
        roomId,
        ...(beforeId ? { id: { lt: beforeId } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: messageInclude,
    });
    return messages.reverse();
  }

  async sendMessage(
    roomId: number,
    senderId: number,
    data: {
      content?: string;
      type?: ChatMessageType;
      replyToId?: number;
      file?: Express.Multer.File;
      durationSec?: number;
      mentions?: { type: ChatMentionType; refId: number; label: string }[];
      poll?: { question: string; options: string[]; multipleChoice?: boolean };
    },
  ) {
    await this.assertMember(roomId, senderId);

    let type = data.type || ChatMessageType.TEXT;
    if (data.poll) type = ChatMessageType.POLL;
    else if (data.file) {
      if (
        data.file.mimetype.startsWith('image/') ||
        data.type === ChatMessageType.IMAGE ||
        String(data.type) === 'IMAGE'
      ) {
        type = ChatMessageType.IMAGE;
      } else if (
        data.file.mimetype.startsWith('audio/') ||
        data.type === ChatMessageType.VOICE ||
        String(data.type) === 'VOICE'
      ) {
        type = ChatMessageType.VOICE;
      } else {
        type = ChatMessageType.FILE;
      }
    }

    if (type === ChatMessageType.TEXT && !data.content?.trim() && !data.poll) {
      throw new BadRequestException('متن پیام خالی است');
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        roomId,
        senderId,
        type,
        content: data.content?.trim() || data.poll?.question || null,
        replyToId: data.replyToId,
        originalName: data.file?.originalname,
        storedName: data.file ? `chat/${data.file.filename}` : undefined,
        mimeType: data.file?.mimetype,
        size: data.file?.size,
        durationSec: data.durationSec,
        mentions: data.mentions?.length
          ? { create: data.mentions.map((m) => ({ type: m.type, refId: m.refId, label: m.label })) }
          : undefined,
        poll: data.poll
          ? {
              create: {
                question: data.poll.question,
                multipleChoice: !!data.poll.multipleChoice,
                options: {
                  create: data.poll.options
                    .filter(Boolean)
                    .map((text, order) => ({ text, order })),
                },
              },
            }
          : undefined,
      },
      include: messageInclude,
    });

    const members = await this.prisma.chatRoomMember.findMany({
      where: { roomId, userId: { not: senderId } },
    });

    await this.prisma.chatMessageReceipt.createMany({
      data: members.map((m) => ({
        messageId: message.id,
        userId: m.userId,
      })),
      skipDuplicates: true,
    });

    const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    const preview =
      type === ChatMessageType.POLL
        ? `📊 ${data.poll?.question}`
        : type === ChatMessageType.VOICE
          ? '🎤 پیام صوتی'
          : type === ChatMessageType.IMAGE
            ? '🖼 تصویر'
            : type === ChatMessageType.FILE
              ? '📎 فایل'
              : data.content || 'پیام جدید';

    await this.notifications.notifyUsers(
      members.map((m) => m.userId),
      {
        type: AppNotificationType.CHAT_MESSAGE,
        title: room?.type === ChatRoomType.DIRECT ? 'پیام جدید' : room?.name || 'گروه',
        body: preview.slice(0, 120),
        link: `/chat/${roomId}`,
        meta: { roomId, messageId: message.id },
      },
    );

    return this.prisma.chatMessage.findUnique({
      where: { id: message.id },
      include: messageInclude,
    });
  }

  async markDelivered(messageId: number, userId: number) {
    const msg = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!msg || msg.senderId === userId) return null;
    await this.prisma.chatMessageReceipt.upsert({
      where: { messageId_userId: { messageId, userId } },
      update: {},
      create: { messageId, userId, deliveredAt: new Date() },
    });
    return {
      roomId: msg.roomId,
      summary: await this.getReceiptSummary(messageId),
    };
  }

  async markRead(roomId: number, userId: number, messageIds?: number[]) {
    await this.assertMember(roomId, userId);
    await this.prisma.chatRoomMember.update({
      where: { roomId_userId: { roomId, userId } },
      data: { lastReadAt: new Date() },
    });

    const where: any = {
      message: { roomId, senderId: { not: userId } },
      userId,
      readAt: null,
    };
    if (messageIds?.length) where.messageId = { in: messageIds };

    const receipts = await this.prisma.chatMessageReceipt.findMany({ where });
    if (receipts.length) {
      await this.prisma.chatMessageReceipt.updateMany({
        where: { id: { in: receipts.map((r) => r.id) } },
        data: { readAt: new Date() },
      });
    }

    // create missing receipts as read
    if (messageIds?.length) {
      for (const messageId of messageIds) {
        const msg = await this.prisma.chatMessage.findFirst({
          where: { id: messageId, roomId, senderId: { not: userId } },
        });
        if (!msg) continue;
        await this.prisma.chatMessageReceipt.upsert({
          where: { messageId_userId: { messageId, userId } },
          update: { readAt: new Date() },
          create: {
            messageId,
            userId,
            deliveredAt: new Date(),
            readAt: new Date(),
          },
        });
      }
    }

    return { ok: true, messageIds: messageIds || receipts.map((r) => r.messageId) };
  }

  async getReceiptSummary(messageId: number) {
    const receipts = await this.prisma.chatMessageReceipt.findMany({
      where: { messageId },
      include: { user: { select: senderSelect } },
    });
    return {
      messageId,
      delivered: receipts.filter((r) => r.deliveredAt).length,
      read: receipts.filter((r) => r.readAt).length,
      readers: receipts.filter((r) => r.readAt).map((r) => r.user),
      receipts,
    };
  }

  async vote(pollOptionId: number, userId: number) {
    const option = await this.prisma.chatPollOption.findUnique({
      where: { id: pollOptionId },
      include: { poll: { include: { message: true, options: true } } },
    });
    if (!option) throw new NotFoundException('گزینه یافت نشد');
    await this.assertMember(option.poll.message.roomId, userId);

    if (!option.poll.multipleChoice) {
      const optionIds = option.poll.options.map((o) => o.id);
      await this.prisma.chatPollVote.deleteMany({
        where: { userId, optionId: { in: optionIds } },
      });
    }

    await this.prisma.chatPollVote.upsert({
      where: { optionId_userId: { optionId: pollOptionId, userId } },
      update: {},
      create: { optionId: pollOptionId, userId },
    });

    return this.prisma.chatMessage.findUnique({
      where: { id: option.poll.messageId },
      include: messageInclude,
    });
  }

  async editMessage(messageId: number, userId: number, content: string) {
    const msg = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('پیام یافت نشد');
    if (msg.senderId !== userId) {
      throw new ForbiddenException('فقط فرستنده می‌تواند پیام را ویرایش کند');
    }
    if (msg.type !== ChatMessageType.TEXT) {
      throw new BadRequestException('فقط پیام متنی قابل ویرایش است');
    }
    const text = (content || '').trim();
    if (!text) throw new BadRequestException('متن پیام خالی است');

    return this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { content: text, editedAt: new Date() },
      include: messageInclude,
    });
  }

  async deleteMessage(messageId: number, userId: number) {
    const msg = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('پیام یافت نشد');
    if (msg.senderId !== userId) {
      throw new ForbiddenException('فقط فرستنده می‌تواند پیام را حذف کند');
    }
    if (msg.type === ChatMessageType.SYSTEM) {
      throw new BadRequestException('این پیام قابل حذف نیست');
    }

    const roomId = msg.roomId;
    await this.prisma.chatMessage.delete({ where: { id: messageId } });
    return { ok: true, id: messageId, roomId };
  }

  searchMentions(q: string) {
    const query = (q || '').trim();
    return Promise.all([
      this.prisma.user.findMany({
        where: {
          isActive: true,
          ...(query ? { fullName: { contains: query, mode: 'insensitive' } } : {}),
        },
        take: 8,
        select: senderSelect,
      }),
      this.prisma.task.findMany({
        where: query ? { title: { contains: query, mode: 'insensitive' } } : {},
        take: 8,
        select: { id: true, title: true, projectId: true },
      }),
      this.prisma.project.findMany({
        where: {
          isActive: true,
          ...(query ? { name: { contains: query, mode: 'insensitive' } } : {}),
        },
        take: 8,
        select: { id: true, name: true },
      }),
    ]).then(([users, tasks, projects]) => ({ users, tasks, projects }));
  }
}
