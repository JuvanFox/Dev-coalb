import { Server as SocketIOServer, Socket } from "socket.io";
import { prisma } from "../index";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  displayName?: string;
  avatarUrl?: string | null;
}

export function setupChatHandlers(io: SocketIOServer, socket: AuthenticatedSocket) {
  // ─── Join a room channel ──────────────────────────────
  socket.on("room:join", async (roomId: string) => {
    if (!socket.userId) return;

    // Verify user is a member of the room (or room is public)
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return;

    if (!room.isPublic) {
      const membership = await prisma.roomMember.findUnique({
        where: { roomId_userId: { roomId, userId: socket.userId } },
      });
      if (!membership) return;
    }

    socket.join(`room:${roomId}`);
    console.log(`[socket] ${socket.displayName} joined room:${roomId}`);
  });

  // ─── Leave a room channel ─────────────────────────────
  socket.on("room:leave", (roomId: string) => {
    socket.leave(`room:${roomId}`);
    console.log(`[socket] ${socket.displayName} left room:${roomId}`);
  });

  // ─── Typing indicator ─────────────────────────────────
  socket.on("typing:start", (data: { roomId: string }) => {
    socket.to(`room:${data.roomId}`).emit("typing:start", {
      userId: socket.userId,
      displayName: socket.displayName,
    });
  });

  socket.on("typing:stop", (data: { roomId: string }) => {
    socket.to(`room:${data.roomId}`).emit("typing:stop", {
      userId: socket.userId,
    });
  });

  // ─── Message read receipt ─────────────────────────────
  socket.on("message:read", (data: { roomId: string; messageId: string }) => {
    socket.to(`room:${data.roomId}`).emit("message:read", {
      messageId: data.messageId,
      userId: socket.userId,
    });
  });
}
