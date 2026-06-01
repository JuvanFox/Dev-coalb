import { Router, Request, Response } from "express";
import { prisma } from "../index";
import { requireAuth, AuthUser } from "../middleware/auth";

export const voiceRouter = Router();

// ─── GET /api/voice/:roomId ─────────────────────────────
voiceRouter.get("/:roomId", requireAuth, async (req: Request, res: Response) => {
  try {
    const channels = await prisma.voiceChannel.findMany({
      where: { roomId: req.params.roomId },
      include: {
        members: {
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true } },
          },
        },
      },
    });
    res.json({ channels });
  } catch (err) {
    console.error("Get voice channels error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/voice/:roomId ────────────────────────────
voiceRouter.post("/:roomId", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;
    const { name } = req.body;

    if (!name || typeof name !== "string" || name.length < 2) {
      return res.status(400).json({ error: "Channel name must be at least 2 characters" });
    }

    const membership = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: req.params.roomId, userId: user.id } },
    });

    if (!membership || membership.role !== "admin") {
      return res.status(403).json({ error: "Only admins can create voice channels" });
    }

    const channel = await prisma.voiceChannel.create({
      data: {
        name,
        roomId: req.params.roomId,
      },
    });

    res.status(201).json({ channel });
  } catch (err) {
    console.error("Create voice channel error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DELETE /api/voice/:roomId/:channelId ───────────────
voiceRouter.delete(
  "/:roomId/:channelId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = req.user as AuthUser;
      const membership = await prisma.roomMember.findUnique({
        where: { roomId_userId: { roomId: req.params.roomId, userId: user.id } },
      });

      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ error: "Only admins can delete voice channels" });
      }

      await prisma.voiceChannel.delete({
        where: { id: req.params.channelId },
      });

      res.json({ message: "Voice channel deleted" });
    } catch (err) {
      console.error("Delete voice channel error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);
