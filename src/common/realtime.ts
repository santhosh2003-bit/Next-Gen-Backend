import { Server as SocketServer } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';

let io: SocketServer | null = null;

/**
 * Attach a Socket.IO server to the running HTTP server. Clients authenticate
 * with their JWT access token and join a private room keyed by user id so the
 * notification worker can push realtime events.
 */
export function initRealtime(app: FastifyInstance) {
  io = new SocketServer(app.server, {
    cors: { origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',') },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const payload = app.jwt.verify<{ sub: string }>(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);
    socket.emit('connected', { userId });
  });

  return io;
}

/** Emit a realtime event to a specific user's room. */
export function emitToUser(userId: string, event: string, data: unknown) {
  io?.to(`user:${userId}`).emit(event, data);
}
