import { Router, Request, Response, NextFunction } from "express";
import passport from "passport";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../index";
import { generateToken, requireAuth, AuthUser } from "../middleware/auth";
import { env } from "../config/env";

export const authRouter = Router();

// ─── Middleware to check if GitHub OAuth is configured ──
function requireGitHubConfig(_req: Request, _res: Response, next: NextFunction) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return _res.status(501).json({ error: "GitHub OAuth is not configured" });
  }
  next();
}

// ─── Validation Schemas ─────────────────────────────────
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(2).max(50),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// ─── GET /api/auth/providers ────────────────────────────
authRouter.get("/providers", (_req: Request, res: Response) => {
  res.json({
    providers: {
      github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
    },
  });
});

// ─── POST /api/auth/register ────────────────────────────
authRouter.post("/register", async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        displayName: data.displayName,
      },
    });

    // Auto-join the General room
    const generalRoom = await prisma.room.findFirst({
      where: { name: "General", isPublic: true },
    });
    if (generalRoom) {
      await prisma.roomMember.create({
        data: {
          roomId: generalRoom.id,
          userId: user.id,
          role: "member",
        },
      }).catch(() => {}); // Ignore if already a member
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
    };

    const token = generateToken(authUser);
    res.status(201).json({ user: authUser, token });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors });
    }
    console.error("Register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/auth/login ───────────────────────────────
authRouter.post("/login", (req: Request, res: Response, next) => {
  passport.authenticate("local", { session: false }, (err: any, user: AuthUser | false, info: any) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).json({ error: info?.message || "Invalid credentials" });
    }
    const token = generateToken(user);
    res.json({ user, token });
  })(req, res, next);
});

// ─── GET /api/auth/me ───────────────────────────────────
authRouter.get("/me", requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

// ─── GitHub OAuth Routes ────────────────────────────────
authRouter.get(
  "/github",
  requireGitHubConfig,
  passport.authenticate("github", { scope: ["user:email"], session: false })
);

authRouter.get(
  "/github/callback",
  requireGitHubConfig,
  passport.authenticate("github", {
    session: false,
    failureRedirect: `${env.FRONTEND_URL}/login`,
  }),
  (req: Request, res: Response) => {
    const user = req.user as AuthUser;
    const token = generateToken(user);
    res.redirect(`${env.FRONTEND_URL}/auth/callback?token=${token}`);
  }
);
