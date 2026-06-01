import express from "express";
import cors from "cors";
import http from "http";
import rateLimit from "express-rate-limit";
import { Server as SocketIOServer } from "socket.io";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { env } from "./config/env";
import { configurePassport } from "./middleware/auth";
import { authRouter } from "./routes/auth";
import { roomsRouter } from "./routes/rooms";
import { notesRouter } from "./routes/notes";
import { messagesRouter } from "./routes/messages";
import { filesRouter } from "./routes/files";
import { voiceRouter } from "./routes/voice";
import { usersRouter } from "./routes/users";
import { setupSocketHandlers } from "./sockets/index";
import { initializeMediasoupWorkers } from "./webrtc/mediasoup";
import { ensureBucketExists } from "./services/s3";

export const prisma = new PrismaClient();
export const redis = new Redis(env.REDIS_URL);

const app = express();
const server = http.createServer(app);

export const io = new SocketIOServer(server, {
  cors: {
    origin: env.FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Mediasoup WebRTC transport needs larger maxHttpBufferSize
  maxHttpBufferSize: 1e7,
});

// ─── Middleware ──────────────────────────────────────────
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Rate Limiting ──────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

configurePassport(app);

// ─── API Routes ─────────────────────────────────────────
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/rooms", generalLimiter, roomsRouter);
app.use("/api/notes", generalLimiter, notesRouter);
app.use("/api/messages", generalLimiter, messagesRouter);
app.use("/api/files", generalLimiter, filesRouter);
app.use("/api/voice", generalLimiter, voiceRouter);
app.use("/api/users", generalLimiter, usersRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── WebSocket ──────────────────────────────────────────
setupSocketHandlers(io);

// ─── Mediasoup (WebRTC) ─────────────────────────────────
let mediasoupStarted = false;

async function startMediasoup() {
  try {
    await initializeMediasoupWorkers();
    mediasoupStarted = true;
    console.log("[mediasoup] Workers initialized");
  } catch (err) {
    console.warn("[mediasoup] Failed to initialize (may not be available):", err);
  }
}

// ─── Start Server ───────────────────────────────────────
async function main() {
  await prisma.$connect();
  console.log("[db] Connected to PostgreSQL");

  await startMediasoup();

  await ensureBucketExists();

  server.listen(env.PORT, () => {
    console.log(`[server] Running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

// ─── Graceful Shutdown ──────────────────────────────────
process.on("SIGTERM", async () => {
  console.log("[server] SIGTERM received, shutting down gracefully...");
  server.close(() => {
    prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });
});
