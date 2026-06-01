import { Router, Request, Response } from "express";
import { prisma } from "../index";
import { requireAuth, AuthUser } from "../middleware/auth";

export const usersRouter = Router();

// ─── GET /api/users/search?q= ──────────────────────────
usersRouter.get("/search", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;
    const query = (req.query.q as string || "").trim();

    if (!query || query.length < 1) {
      return res.json({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: user.id } }, // Exclude self
          {
            OR: [
              { displayName: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
            ],
          },
        ],
      },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        email: true,
      },
      take: 20,
      orderBy: { displayName: "asc" },
    });

    res.json({ users });
  } catch (err) {
    console.error("Search users error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
