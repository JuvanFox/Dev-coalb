import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../index";
import { requireAuth, AuthUser } from "../middleware/auth";

export const roomsRouter = Router();

const createRoomSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().default(true),
});

const updateRoomSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
});

// ─── GET /api/rooms ─────────────────────────────────────
roomsRouter.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;

    const rooms = await prisma.room.findMany({
      where: {
        OR: [
          { isPublic: true },
          { members: { some: { userId: user.id } } },
        ],
      },
      include: {
        members: {
          include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
        _count: { select: { messages: true, notes: true, files: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    res.json({ rooms });
  } catch (err) {
    console.error("Get rooms error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/rooms/:id ─────────────────────────────────
roomsRouter.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const room = await prisma.room.findUnique({
      where: { id: req.params.id },
      include: {
        members: {
          include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
        voiceChannels: true,
        _count: { select: { messages: true, notes: true, files: true } },
      },
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const user = req.user as AuthUser;
    const isMember = room.members.some((m) => m.userId === user.id);

    if (!room.isPublic && !isMember) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({ room });
  } catch (err) {
    console.error("Get room error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/rooms ────────────────────────────────────
roomsRouter.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = createRoomSchema.parse(req.body);
    const user = req.user as AuthUser;

    const room = await prisma.room.create({
      data: {
        name: data.name,
        description: data.description,
        isPublic: data.isPublic,
        createdById: user.id,
        members: {
          create: { userId: user.id, role: "admin" },
        },
      },
      include: {
        members: {
          include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
      },
    });

    res.status(201).json({ room });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors });
    }
    console.error("Create room error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PUT /api/rooms/:id ─────────────────────────────────
roomsRouter.put("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = updateRoomSchema.parse(req.body);
    const user = req.user as AuthUser;

    const room = await prisma.room.findUnique({
      where: { id: req.params.id },
      include: { members: true },
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const member = room.members.find((m) => m.userId === user.id);
    if (!member || member.role !== "admin") {
      return res.status(403).json({ error: "Only admins can update rooms" });
    }

    const updated = await prisma.room.update({
      where: { id: req.params.id },
      data,
      include: {
        members: {
          include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
      },
    });

    res.json({ room: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors });
    }
    console.error("Update room error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/rooms/:id/join ───────────────────────────
roomsRouter.post("/:id/join", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;
    const room = await prisma.room.findUnique({ where: { id: req.params.id } });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const existing = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: req.params.id, userId: user.id } },
    });

    if (existing) {
      return res.json({ room });
    }

    await prisma.roomMember.create({
      data: { roomId: req.params.id, userId: user.id },
    });

    const updated = await prisma.room.findUnique({
      where: { id: req.params.id },
      include: {
        members: {
          include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
      },
    });

    res.json({ room: updated });
  } catch (err) {
    console.error("Join room error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/rooms/:id/members ─────────────────────────
// Room admin invites a user to the room
roomsRouter.post("/:id/members", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;
    const { userId: targetUserId } = req.body;

    if (!targetUserId || typeof targetUserId !== "string") {
      return res.status(400).json({ error: "userId is required" });
    }

    const room = await prisma.room.findUnique({
      where: { id: req.params.id },
      include: { members: true },
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Check requester is an admin
    const requesterMember = room.members.find((m) => m.userId === user.id);
    if (!requesterMember || requesterMember.role !== "admin") {
      return res.status(403).json({ error: "Only admins can add members" });
    }

    // Check target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, displayName: true, avatarUrl: true },
    });
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if already a member
    const existing = room.members.find((m) => m.userId === targetUserId);
    if (existing) {
      return res.status(409).json({ error: "User is already a member" });
    }

    // Add member
    await prisma.roomMember.create({
      data: { roomId: req.params.id, userId: targetUserId, role: "member" },
    });

    const updated = await prisma.room.findUnique({
      where: { id: req.params.id },
      include: {
        members: {
          include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
        voiceChannels: true,
        _count: { select: { messages: true, notes: true, files: true } },
      },
    });

    res.status(201).json({ room: updated });
  } catch (err) {
    console.error("Add member error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DELETE /api/rooms/:id/members/:userId ──────────────
// Room admin removes a member
roomsRouter.delete("/:id/members/:userId", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;
    const { id: roomId, userId: targetUserId } = req.params;

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { members: true },
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Check requester is an admin
    const requesterMember = room.members.find((m) => m.userId === user.id);
    if (!requesterMember || requesterMember.role !== "admin") {
      return res.status(403).json({ error: "Only admins can remove members" });
    }

    // Cannot remove the creator/admin themselves
    const targetMember = room.members.find((m) => m.userId === targetUserId);
    if (!targetMember) {
      return res.status(404).json({ error: "Member not found" });
    }
    if (targetMember.role === "admin" && targetUserId !== user.id) {
      return res.status(403).json({ error: "Cannot remove another admin" });
    }

    await prisma.roomMember.delete({
      where: { roomId_userId: { roomId, userId: targetUserId } },
    });

    const updated = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        members: {
          include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
        voiceChannels: true,
        _count: { select: { messages: true, notes: true, files: true } },
      },
    });

    res.json({ room: updated });
  } catch (err) {
    console.error("Remove member error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DELETE /api/rooms/:id ──────────────────────────────
roomsRouter.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;
    const room = await prisma.room.findUnique({
      where: { id: req.params.id },
      include: { members: true },
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const member = room.members.find((m) => m.userId === user.id);
    if (!member || member.role !== "admin") {
      return res.status(403).json({ error: "Only admins can delete rooms" });
    }

    await prisma.room.delete({ where: { id: req.params.id } });
    res.json({ message: "Room deleted" });
  } catch (err) {
    console.error("Delete room error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
