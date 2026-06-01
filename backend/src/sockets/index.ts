import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../index";
import { setupChatHandlers } from "./chat";
import { setupPresenceHandlers } from "./presence";
import { setupVoiceSignaling } from "../webrtc/signaling";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  displayName?: string;
  avatarUrl?: string | null;
}

export function setupSocketHandlers(io: SocketIOServer) {
  // ─── Auth middleware for Socket.IO ─────────────────────
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(token as string, env.JWT_SECRET) as {
        id: string;
        email: string;
      };

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, displayName: true, avatarUrl: true },
      });

      if (!user) {
        return next(new Error("User not found"));
      }

      socket.userId = user.id;
      socket.displayName = user.displayName;
      socket.avatarUrl = user.avatarUrl;
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    console.log(`[socket] User ${socket.displayName} (${socket.userId}) connected`);

    // Join user's personal room (for direct messages)
    socket.join(`user:${socket.userId}`);

    // Setup handlers
    setupChatHandlers(io, socket);
    setupPresenceHandlers(io, socket);
    setupVoiceSignaling(io, socket);

    socket.on("disconnect", () => {
      console.log(`[socket] User ${socket.displayName} (${socket.userId}) disconnected`);
    });
  });
}
