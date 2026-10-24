import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwt: JwtService,
    private chat: ChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = this.jwt.verify(token);
      client.data.userId = payload.sub || payload.id;
      client.join(`user:${client.data.userId}`);
    } catch {
      client.disconnect();
    }
  }

  @SubscribeMessage('join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomId: number },
  ) {
    const userId = client.data.userId;
    if (!userId || !body?.roomId) return { ok: false };
    try {
      await this.chat.assertMember(body.roomId, userId);
      client.join(`room:${body.roomId}`);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('leave')
  leave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomId: number },
  ) {
    if (body?.roomId) client.leave(`room:${body.roomId}`);
    return { ok: true };
  }

  @SubscribeMessage('typing')
  typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomId: number; typing: boolean },
  ) {
    if (!body?.roomId) return;
    client.to(`room:${body.roomId}`).emit('typing', {
      roomId: body.roomId,
      userId: client.data.userId,
      typing: !!body.typing,
    });
  }

  emitMessage(roomId: number, message: any) {
    this.server?.to(`room:${roomId}`).emit('message', message);
  }

  emitMessageDeleted(roomId: number, messageId: number) {
    this.server?.to(`room:${roomId}`).emit('message_deleted', { roomId, messageId });
  }

  emitRead(roomId: number, payload: any) {
    this.server?.to(`room:${roomId}`).emit('read', payload);
  }

  emitReceipt(roomId: number, payload: any) {
    this.server?.to(`room:${roomId}`).emit('receipt', payload);
  }
}
