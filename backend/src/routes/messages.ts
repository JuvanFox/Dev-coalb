import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma, io } from "../index";
import { requireAuth, AuthUser } from "../middleware/auth";

export const messagesRouter = Router();

const createMessageSchema = z.object({
  content: z.string().min(1).max(5000),
  parentId: z.string().uuid().optional(),
});

// ─── GET /api/messages/search?q=&roomId= ──────────────
messagesRouter.get("/search", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;
    const query = (req.query.q as string || "").trim();
    const roomId = req.query.roomId as string | undefined;

    if (!query || query.length < 1) {
      return res.json({ messages: [] });
    }

    // Get all rooms the user is a member of
    const userRooms = await prisma.roomMember.findMany({
      where: { userId: user.id },
      select: { roomId: true },
    });

    const roomIds = userRooms.map((r) => r.roomId);

    // If specific room requested, filter
    const searchRoomIds = roomId ? (roomIds.includes(roomId) ? [roomId] : []) : roomIds;

    if (searchRoomIds.length === 0) {
      return res.json({ messages: [] });
    }

    // Search messages using ILIKE (case-insensitive)
    const searchTerm = `%${query}%`;
    const messages = await prisma.message.findMany({
      where: {
        roomId: { in: searchRoomIds },
        content: { contains: query, mode: "insensitive" },
        parentId: null, // Only top-level messages
      },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
        file: true,
        room: { select: { id: true, name: true } },
        reactions: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ messages });
  } catch (err) {
    console.error("Search messages error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/messages/:roomId ──────────────────────────
messagesRouter.get("/:roomId", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;
    const { roomId } = req.params;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    // Verify membership
    const membership = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: user.id } },
    });

    if (!membership) {
      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room || !room.isPublic) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const messages = await prisma.message.findMany({
      where: { roomId, parentId: null }, // Only top-level messages
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
        file: true,
        reactions: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = messages.length > limit;
    const data = hasMore ? messages.slice(0, limit) : messages;

    res.json({
      messages: data.reverse(), // Return in chronological order
      nextCursor: hasMore ? data[0]?.id : null,
    });
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/messages/:roomId/:messageId/thread ────────
messagesRouter.get(
  "/:roomId/:messageId/thread",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const replies = await prisma.message.findMany({
        where: { parentId: req.params.messageId },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
          file: true,
          reactions: {
            include: {
              user: { select: { id: true, displayName: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      res.json({ replies });
    } catch (err) {
      console.error("Get thread error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── POST /api/messages/:roomId ─────────────────────────
messagesRouter.post("/:roomId", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = createMessageSchema.parse(req.body);
    const user = req.user as AuthUser;

    const membership = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: req.params.roomId, userId: user.id } },
    });

    if (!membership) {
      return res.status(403).json({ error: "Must be a member to send messages" });
    }

    const message = await prisma.message.create({
      data: {
        content: data.content,
        contentType: "text",
        roomId: req.params.roomId,
        userId: user.id,
        parentId: data.parentId,
      },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
        file: true,
        reactions: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
      },
    });

    // Emit via Socket.IO
    io.to(`room:${req.params.roomId}`).emit("message:new", message);

    res.status(201).json({ message });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors });
    }
    console.error("Create message error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DELETE /api/messages/:roomId/:messageId ────────────
messagesRouter.delete(
  "/:roomId/:messageId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = req.user as AuthUser;
      const message = await prisma.message.findUnique({
        where: { id: req.params.messageId },
      });

      if (!message || message.roomId !== req.params.roomId) {
        return res.status(404).json({ error: "Message not found" });
      }

      if (message.userId !== user.id) {
        // Allow room admins to delete any message
        const membership = await prisma.roomMember.findUnique({
          where: {
            roomId_userId: {
              roomId: req.params.roomId,
              userId: user.id,
            },
          },
        });
        if (!membership || membership.role !== "admin") {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      await prisma.message.delete({ where: { id: req.params.messageId } });

      io.to(`room:${req.params.roomId}`).emit("message:delete", {
        messageId: req.params.messageId,
      });

      res.json({ message: "Message deleted" });
    } catch (err) {
      console.error("Delete message error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ═══════════════════════════════════════════════════════════
//  REACTIONS
// ═══════════════════════════════════════════════════════════

// ─── POST /api/messages/:roomId/:messageId/reactions ────
// Toggle a reaction: add if not present, remove if present
messagesRouter.post(
  "/:roomId/:messageId/reactions",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = req.user as AuthUser;
      const { messageId, roomId } = req.params;
      const { emoji } = req.body;

      if (!emoji || typeof emoji !== "string" || emoji.length > 10) {
        return res.status(400).json({ error: "Invalid emoji" });
      }

      // Verify message exists and user has access
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, roomId: true },
      });

      if (!message || message.roomId !== roomId) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Check if reaction already exists
      const existing = await prisma.reaction.findUnique({
        where: {
          messageId_userId_emoji: {
            messageId,
            userId: user.id,
            emoji,
          },
        },
      });

      if (existing) {
        // Remove reaction
        await prisma.reaction.delete({
          where: { id: existing.id },
        });

        io.to(`room:${roomId}`).emit("reaction:removed", {
          messageId,
          userId: user.id,
          emoji,
        });

        return res.json({ action: "removed", emoji });
      } else {
        // Add reaction
        const reaction = await prisma.reaction.create({
          data: {
            messageId,
            userId: user.id,
            emoji,
          },
          include: {
            user: { select: { id: true, displayName: true } },
          },
        });

        io.to(`room:${roomId}`).emit("reaction:added", {
          messageId,
          reaction,
        });

        return res.status(201).json({ action: "added", reaction });
      }
    } catch (err) {
      console.error("Toggle reaction error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── GET /api/messages/:roomId/:messageId/reactions ─────
messagesRouter.get(
  "/:roomId/:messageId/reactions",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const reactions = await prisma.reaction.findMany({
        where: { messageId: req.params.messageId },
        include: {
          user: { select: { id: true, displayName: true } },
        },
      });

      res.json({ reactions });
    } catch (err) {
      console.error("Get reactions error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);
