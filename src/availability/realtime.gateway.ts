import { Inject } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service.js';
@WebSocketGateway({
  cors: {
    origin: (process.env.WEB_ORIGINS ?? 'http://localhost:8081').split(','),
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;
  constructor(@Inject(AuthService) private auth: AuthService) {}
  async handleConnection(client: Socket) {
    const token = client.handshake.auth.token as string | undefined;
    if (!token) return;
    try {
      const user = await this.auth.authenticate(token);
      if (!client.connected) return;
      await client.join(`user:${user.id}`);
      // Bound private subscriptions to the access-token lifetime; the client reconnects after refresh.
      const timer = setTimeout(() => client.disconnect(true), 15 * 60000);
      client.once('disconnect', () => clearTimeout(timer));
    } catch {
      client.disconnect(true);
    }
  }
  changed(spaceId: string, userIds: string[] = []) {
    this.server?.emit('availability.changed', { spaceId });
    for (const userId of new Set(userIds)) {
      const room = this.server?.sockets.adapter.rooms.get(`user:${userId}`);
      for (const socketId of room ?? []) {
        const socket = this.server.sockets.sockets.get(socketId);
        if (!socket) continue;
        void this.auth
          .authenticate(socket.handshake.auth.token as string)
          .then((user) => {
            if (user.id === userId && socket.connected)
              socket.emit('bookings.changed', { spaceId });
          })
          .catch(() => socket.disconnect(true));
      }
    }
  }
}
