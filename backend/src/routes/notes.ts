import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../index";
import { requireAuth, AuthUser } from "../middleware/auth";

export const notesRouter = Router();

const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string(),
  isPrivate: z.boolean().default(false),
});

const updateNoteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  isPrivate: z.boolean().optional(),
});

// ─── GET /api/notes/:roomId ─────────────────────────────
notesRouter.get("/:roomId", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;

    // Verify membership
    const membership = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: { roomId: req.params.roomId, userId: user.id },
      },
    });

    if (!membership) {
      const room = await prisma.room.findUnique({
        where: { id: req.params.roomId },
      });
      if (!room || !room.isPublic) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const notes = await prisma.note.findMany({
      where: {
        roomId: req.params.roomId,
        OR: [
          { isPrivate: false },
          { userId: user.id },
        ],
      },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    res.json({ notes });
  } catch (err) {
    console.error("Get notes error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/notes/:roomId/:noteId ─────────────────────
notesRouter.get("/:roomId/:noteId", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;
    const note = await prisma.note.findUnique({
      where: { id: req.params.noteId },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    if (!note || note.roomId !== req.params.roomId) {
      return res.status(404).json({ error: "Note not found" });
    }

    if (note.isPrivate && note.userId !== user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({ note });
  } catch (err) {
    console.error("Get note error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/notes/:roomId ────────────────────────────
notesRouter.post("/:roomId", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = createNoteSchema.parse(req.body);
    const user = req.user as AuthUser;

    const membership = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: { roomId: req.params.roomId, userId: user.id },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: "Must be a member to create notes" });
    }

    const note = await prisma.note.create({
      data: {
        title: data.title,
        content: data.content,
        isPrivate: data.isPrivate,
        roomId: req.params.roomId,
        userId: user.id,
      },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    res.status(201).json({ note });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors });
    }
    console.error("Create note error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PUT /api/notes/:roomId/:noteId ─────────────────────
notesRouter.put("/:roomId/:noteId", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = updateNoteSchema.parse(req.body);
    const user = req.user as AuthUser;

    const note = await prisma.note.findUnique({
      where: { id: req.params.noteId },
    });

    if (!note || note.roomId !== req.params.roomId) {
      return res.status(404).json({ error: "Note not found" });
    }

    if (note.userId !== user.id) {
      return res.status(403).json({ error: "Only the author can edit notes" });
    }

    const updated = await prisma.note.update({
      where: { id: req.params.noteId },
      data,
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    res.json({ note: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors });
    }
    console.error("Update note error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DELETE /api/notes/:roomId/:noteId ──────────────────
notesRouter.delete("/:roomId/:noteId", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;
    const note = await prisma.note.findUnique({
      where: { id: req.params.noteId },
    });

    if (!note || note.roomId !== req.params.roomId) {
      return res.status(404).json({ error: "Note not found" });
    }

    if (note.userId !== user.id) {
      return res.status(403).json({ error: "Only the author can delete notes" });
    }

    await prisma.note.delete({ where: { id: req.params.noteId } });
    res.json({ message: "Note deleted" });
  } catch (err) {
    console.error("Delete note error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
