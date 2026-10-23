import { Injectable } from '@nestjs/common';
import { AppNotificationType } from '@prisma/client';
import * as webpush from 'web-push';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

type VapidKeys = { publicKey: string; privateKey: string };

@Injectable()
export class NotificationsService {
  private vapid: VapidKeys;

  constructor(private prisma: PrismaService) {
    this.vapid = this.loadOrCreateVapid();
    webpush.setVapidDetails(
      'mailto:admin@pmo.local',
      this.vapid.publicKey,
      this.vapid.privateKey,
    );
  }

  getPublicKey() {
    return this.vapid.publicKey;
  }

  private loadOrCreateVapid(): VapidKeys {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      return {
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
      };
    }
    const dir = join(process.cwd(), 'uploads');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const path = join(dir, 'vapid.json');
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf8'));
    }
    const keys = webpush.generateVAPIDKeys();
    writeFileSync(path, JSON.stringify(keys));
    return keys;
  }

  async saveSubscription(
    userId: number,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: {
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
    });
  }

  async notifyUsers(
    userIds: number[],
    data: {
      type: AppNotificationType;
      title: string;
      body: string;
      link?: string;
      meta?: any;
    },
  ) {
    const unique = [...new Set(userIds)];
    if (!unique.length) return;

    await this.prisma.appNotification.createMany({
      data: unique.map((userId) => ({
        userId,
        type: data.type,
        title: data.title,
        body: data.body,
        link: data.link,
        meta: data.meta || undefined,
      })),
    });

    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: unique } },
    });

    const payload = JSON.stringify({
      title: data.title,
      body: data.body,
      link: data.link || '/',
      type: data.type,
    });

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            payload,
          );
        } catch {
          if (true) {
            /* invalid subscription - ignore */
          }
        }
      }),
    );
  }

  list(userId: number) {
    return this.prisma.appNotification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(userId: number, id?: number) {
    if (id) {
      await this.prisma.appNotification.updateMany({
        where: { id, userId },
        data: { readAt: new Date() },
      });
    } else {
      await this.prisma.appNotification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });
    }
    return { ok: true };
  }

  unreadCount(userId: number) {
    return this.prisma.appNotification.count({
      where: { userId, readAt: null },
    });
  }
}
