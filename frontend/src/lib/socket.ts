import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getChatSocket() {
  const token = localStorage.getItem('pmo_token');
  if (!token) return null;

  if (socket?.connected) return socket;

  const url = import.meta.env.VITE_SOCKET_URL || undefined;
  socket = io(url ? `${url}/chat` : '/chat', {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });
  return socket;
}

export function disconnectChatSocket() {
  socket?.disconnect();
  socket = null;
}
