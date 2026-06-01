import { Server as SocketIOServer, Socket } from "socket.io";
import { redis } from "../index";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  displayName?: string;
  avatarUrl?: string | null;
  presenceRooms?: Set<string>;
}

const PRESENCE_PREFIX = "presence:room:";
const PRESENCE_TTL = 60; // 60 seconds

export function setupPresenceHandlers(io: SocketIOServer, socket: AuthenticatedSocket) {
  socket.presenceRooms = new Set();

  // ─── Update presence when joining a room ──────────────
  socket.on("presence:join", async (roomId: string) => {
    if (!socket.userId) return;

    const key = `${PRESENCE_PREFIX}${roomId}`;
    await redis.hset(key, socket.userId, JSON.stringify({
      userId: socket.userId,
      displayName: socket.displayName,
      avatarUrl: socket.avatarUrl,
      lastSeen: Date.now(),
    }));
    await redis.expire(key, PRESENCE_TTL);

    socket.presenceRooms!.add(roomId);

    // Broadcast updated presence to room
    const members = await redis.hgetall(key);
    const presenceList = Object.values(members).map((m) => JSON.parse(m as string));
    io.to(`room:${roomId}`).emit("presence:update", { members: presenceList });
  });

  // ─── Update presence when leaving a room ──────────────
  socket.on("presence:leave", async (roomId: string) => {
    if (!socket.userId) return;

    const key = `${PRESENCE_PREFIX}${roomId}`;
    await redis.hdel(key, socket.userId);

    socket.presenceRooms!.delete(roomId);

    const members = await redis.hgetall(key);
    const presenceList = Object.values(members).map((m) => JSON.parse(m as string));
    io.to(`room:${roomId}`).emit("presence:update", { members: presenceList });
  });

  // ─── Periodic heartbeat (client sends every 30s) ──────
  socket.on("presence:heartbeat", async (roomId: string) => {
    if (!socket.userId) return;

    const key = `${PRESENCE_PREFIX}${roomId}`;
    await redis.hset(key, socket.userId, JSON.stringify({
      userId: socket.userId,
      displayName: socket.displayName,
      avatarUrl: socket.avatarUrl,
      lastSeen: Date.now(),
    }));
    await redis.expire(key, PRESENCE_TTL);
  });

  // ─── Clean up on disconnect ───────────────────────────
  socket.on("disconnect", async () => {
    if (!socket.userId) return;

    // Only clean up rooms this socket was present in (no redis.keys scan)
    for (const roomId of socket.presenceRooms!) {
      const key = `${PRESENCE_PREFIX}${roomId}`;
      await redis.hdel(key, socket.userId);
      const members = await redis.hgetall(key);
      const presenceList = Object.values(members).map((m) => JSON.parse(m as string));
      io.to(`room:${roomId}`).emit("presence:update", { members: presenceList });
    }
  });
}
