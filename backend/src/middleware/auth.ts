import { Express, Request, Response, NextFunction } from "express";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import { Strategy as GitHubStrategy } from "passport-github2";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../index";

// ─── Types ──────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
}

declare global {
  namespace Express {
    interface User extends AuthUser {}
  }
}

// ─── JWT Helpers ────────────────────────────────────────
export function generateToken(user: AuthUser): string {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function configurePassport(app: Express) {
  app.use(passport.initialize());

  // ── Local Strategy (email + password) ──
  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (email, password, done) => {
        try {
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user || !user.passwordHash) {
            return done(null, false, { message: "Invalid credentials" });
          }
          const isValid = await bcrypt.compare(password, user.passwordHash);
          if (!isValid) {
            return done(null, false, { message: "Invalid credentials" });
          }
          return done(null, {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            role: user.role,
          });
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  // ── JWT Strategy ──
  passport.use(
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: env.JWT_SECRET,
      },
      async (payload: { id: string; email: string; role: string }, done) => {
        try {
          const user = await prisma.user.findUnique({
            where: { id: payload.id },
          });
          if (!user) return done(null, false);
          return done(null, {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            role: user.role,
          });
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  // ── GitHub OAuth Strategy ──
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
          callbackURL: `${env.FRONTEND_URL}/api/auth/github/callback`,
        },
        async (
          _accessToken: string,
          _refreshToken: string,
          profile: any,
          done: (err: any, user?: any) => void
        ) => {
          try {
            const githubId = profile.id;
            let user = await prisma.user.findUnique({
              where: { githubId: String(githubId) },
            });
            if (!user) {
              const email =
                profile.emails?.[0]?.value ||
                `${profile.username}@github.local`;
              user = await prisma.user.create({
                data: {
                  email,
                  githubId: String(githubId),
                  displayName: profile.displayName || profile.username,
                  avatarUrl: profile.photos?.[0]?.value,
                },
              });
            }
            return done(null, {
              id: user.id,
              email: user.email,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
              role: user.role,
            });
          } catch (err) {
            return done(err);
          }
        }
      )
    );
  }
}

// ─── Auth Middleware ─────────────────────────────────────
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  passport.authenticate("jwt", { session: false }, (err: any, user: AuthUser | false) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.user = user;
    next();
  })(req, res, next);
}
