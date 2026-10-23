import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChatMentionType, ChatMessageType } from '@prisma/client';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

const chatUploadDir = join(process.cwd(), 'uploads', 'chat');
if (!existsSync(chatUploadDir)) mkdirSync(chatUploadDir, { recursive: true });

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private chat: ChatService,
    private gateway: ChatGateway,
  ) {}

  @Get('rooms')
  listRooms(@CurrentUser() user: any) {
    return this.chat.listRooms(user.id);
  }

  @Post('groups')
  createGroup(
    @CurrentUser() user: any,
    @Body() body: { name: string; description?: string; memberIds?: number[] },
  ) {
    return this.chat.createGroup(user.id, body);
  }

  @Post('direct')
  openDirect(@CurrentUser() user: any, @Body() body: { userId: number }) {
    return this.chat.openDirect(user.id, Number(body.userId));
  }

  @Get('rooms/:id')
  getRoom(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.chat.getRoom(id, user.id);
  }

  @Post('rooms/:id/members')
  addMembers(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { memberIds: number[] },
  ) {
    return this.chat.addMembers(id, user.id, body.memberIds || []);
  }

  @Get('rooms/:id/messages')
  getMessages(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('beforeId') beforeId?: string,
  ) {
    return this.chat.getMessages(id, user.id, beforeId ? Number(beforeId) : undefined);
  }

  @Post('rooms/:id/messages')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: chatUploadDir,
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname) || ''}`);
        },
      }),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async sendMessage(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      content?: string;
      type?: ChatMessageType;
      replyToId?: string;
      durationSec?: string;
      mentions?: string;
      poll?: string;
    },
  ) {
    let mentions:
      | { type: ChatMentionType; refId: number; label: string }[]
      | undefined;
    let poll: { question: string; options: string[]; multipleChoice?: boolean } | undefined;
    try {
      if (body.mentions) mentions = JSON.parse(body.mentions);
      if (body.poll) poll = JSON.parse(body.poll);
    } catch {
      /* ignore bad json */
    }

    const message = await this.chat.sendMessage(id, user.id, {
      content: body.content,
      type: body.type,
      replyToId: body.replyToId ? Number(body.replyToId) : undefined,
      file,
      durationSec: body.durationSec ? Number(body.durationSec) : undefined,
      mentions,
      poll,
    });

    this.gateway.emitMessage(id, message);
    return message;
  }

  @Post('rooms/:id/read')
  async markRead(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { messageIds?: number[] },
  ) {
    const result = await this.chat.markRead(id, user.id, body.messageIds);
    this.gateway.emitRead(id, {
      userId: user.id,
      messageIds: result.messageIds,
      readAt: new Date().toISOString(),
    });
    return result;
  }

  @Post('messages/:id/delivered')
  async markDelivered(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.chat.markDelivered(id, user.id);
    if (result?.roomId) this.gateway.emitReceipt(result.roomId, result.summary);
    return result?.summary || null;
  }

  @Post('polls/options/:id/vote')
  async vote(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const message = await this.chat.vote(id, user.id);
    if (message) this.gateway.emitMessage(message.roomId, message);
    return message;
  }

  @Get('mentions/search')
  searchMentions(@Query('q') q?: string) {
    return this.chat.searchMentions(q || '');
  }
}
