import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get('vapid-public-key')
  vapidKey() {
    return { publicKey: this.notifications.getPublicKey() };
  }

  @Post('subscribe')
  subscribe(
    @CurrentUser() user: { id: number },
    @Body()
    body: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    return this.notifications.saveSubscription(user.id, body);
  }

  @Get()
  list(@CurrentUser() user: { id: number }) {
    return this.notifications.list(user.id);
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: { id: number }) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Patch('read-all')
  readAll(@CurrentUser() user: { id: number }) {
    return this.notifications.markRead(user.id);
  }

  @Patch(':id/read')
  readOne(@CurrentUser() user: { id: number }, @Param('id', ParseIntPipe) id: number) {
    return this.notifications.markRead(user.id, id);
  }
}
