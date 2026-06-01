import { Router, Request, Response } from "express";
import { prisma, io } from "../index";
import { requireAuth, AuthUser } from "../middleware/auth";
import { upload, generateS3Key } from "../middleware/upload";
import { uploadFile, getFileStream, deleteFile } from "../services/s3";

export const filesRouter = Router();

// ─── POST /api/files/:roomId/upload ─────────────────────
filesRouter.post(
  "/:roomId/upload",
  requireAuth,
  upload.single("file"),
  async (req: Request, res: Response) => {
    const user = req.user as AuthUser;
    console.log(`[files] POST /api/files/${req.params.roomId}/upload — user='${user.displayName}'`);

    try {
      if (!req.file) {
        console.error(`[files] ❌ No file in request`);
        return res.status(400).json({ error: "No file provided" });
      }

      console.log(`[files] Received file: mime='${req.file.mimetype}' size=${req.file.size} name='${req.file.originalname}'`);

      const membership = await prisma.roomMember.findUnique({
        where: {
          roomId_userId: { roomId: req.params.roomId, userId: user.id },
        },
      });

      if (!membership) {
        console.error(`[files] ❌ User not a member of room '${req.params.roomId}'`);
        return res.status(403).json({ error: "Must be a member to upload files" });
      }

      const s3Key = generateS3Key(req.params.roomId, req.file.originalname);
      console.log(`[files] Generated S3 key: '${s3Key}'`);

      await uploadFile(s3Key, req.file.buffer, req.file.mimetype);
      console.log(`[files] ✅ S3 upload complete`);

      const message = await prisma.message.create({
        data: {
          contentType: "file",
          content: req.body.caption || req.file.originalname,
          roomId: req.params.roomId,
          userId: user.id,
          file: {
            create: {
              filename: req.file.originalname,
              s3Key,
              mimeType: req.file.mimetype,
              size: req.file.size,
              roomId: req.params.roomId,
              uploadedById: user.id,
            },
          },
        },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
          file: true,
        },
      });

      console.log(`[files] ✅ Message created: id='${message.id}' fileId='${message.file?.id}'`);

      io.to(`room:${req.params.roomId}`).emit("message:new", message);

      res.status(201).json({ message });
    } catch (err) {
      console.error(`[files] ❌ File upload error:`, err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── POST /api/files/:roomId/audio ──────────────────────
filesRouter.post(
  "/:roomId/audio",
  requireAuth,
  upload.single("audio"),
  async (req: Request, res: Response) => {
    const user = req.user as AuthUser;
    console.log(`[files] POST /api/files/${req.params.roomId}/audio — user='${user.displayName}' id='${user.id}'`);

    try {
      if (!req.file) {
        console.error(`[files] ❌ No audio file in request`);
        return res.status(400).json({ error: "No audio file provided" });
      }

      console.log(`[files] Received audio file: mime='${req.file.mimetype}' size=${req.file.size} field='${req.file.fieldname}' originalname='${req.file.originalname}'`);

      const membership = await prisma.roomMember.findUnique({
        where: {
          roomId_userId: { roomId: req.params.roomId, userId: user.id },
        },
      });

      if (!membership) {
        console.error(`[files] ❌ User '${user.id}' is not a member of room '${req.params.roomId}'`);
        return res.status(403).json({ error: "Must be a member to upload audio" });
      }

      const s3Key = generateS3Key(req.params.roomId, `audio-${Date.now()}.webm`);
      console.log(`[files] Generated S3 key: '${s3Key}'`);

      console.log(`[files] Uploading to S3...`);
      await uploadFile(s3Key, req.file.buffer, req.file.mimetype);
      console.log(`[files] ✅ S3 upload complete`);

      console.log(`[files] Creating message record in DB...`);
      const message = await prisma.message.create({
        data: {
          contentType: "audio",
          content: req.body.caption || "Voice message",
          roomId: req.params.roomId,
          userId: user.id,
          file: {
            create: {
              filename: `audio-${Date.now()}.webm`,
              s3Key,
              mimeType: req.file.mimetype,
              size: req.file.size,
              roomId: req.params.roomId,
              uploadedById: user.id,
            },
          },
        },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
          file: true,
        },
      });
      console.log(`[files] ✅ Message created: id='${message.id}' type='${message.contentType}' fileId='${message.file?.id}' s3Key='${message.file?.s3Key}'`);

      io.to(`room:${req.params.roomId}`).emit("message:new", message);
      console.log(`[files] ✅ Socket.IO event 'message:new' emitted to room 'room:${req.params.roomId}'`);

      res.status(201).json({ message });
    } catch (err) {
      console.error(`[files] ❌ Audio upload error:`, err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── GET /api/files/:roomId/:fileId/download ────────────
filesRouter.get(
  "/:roomId/:fileId/download",
  requireAuth,
  async (req: Request, res: Response) => {
    const user = req.user as AuthUser;
    console.log(`[files] GET /api/files/${req.params.roomId}/${req.params.fileId}/download — user='${user.displayName}'`);

    try {
      const file = await prisma.file.findUnique({
        where: { id: req.params.fileId },
      });

      if (!file || file.roomId !== req.params.roomId) {
        console.warn(`[files] ❌ File not found: id='${req.params.fileId}' roomId='${req.params.roomId}'`);
        return res.status(404).json({ error: "File not found" });
      }

      console.log(`[files] Found file: id='${file.id}' s3Key='${file.s3Key}' mimeType='${file.mimeType}' filename='${file.filename}' size=${file.size}`);

      // Stream file directly from S3 through the backend (avoids mixed content & Docker hostname issues)
      console.log(`[files] Fetching from S3: key='${file.s3Key}'`);
      const s3Response = await getFileStream(file.s3Key);
      const stream = s3Response.Body as import("stream").Readable;

      if (!stream) {
        console.error(`[files] ❌ S3 returned empty body for key='${file.s3Key}'`);
        return res.status(500).json({ error: "Could not read file" });
      }

      console.log(`[files] ✅ Streaming file to client: type='${file.mimeType}' length='${s3Response.ContentLength}'`);

      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${file.filename}"`);
      if (s3Response.ContentLength) {
        res.setHeader("Content-Length", String(s3Response.ContentLength));
      }

      let bytesSent = 0;
      stream.on("data", (chunk: Buffer) => {
        bytesSent += chunk.length;
      });
      stream.on("end", () => {
        console.log(`[files] ✅ File streaming complete: sent ${bytesSent} bytes`);
      });

      stream.pipe(res);
    } catch (err) {
      console.error(`[files] ❌ File download error:`, err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── DELETE /api/files/:roomId/:fileId ──────────────────
filesRouter.delete(
  "/:roomId/:fileId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = req.user as AuthUser;
      const file = await prisma.file.findUnique({
        where: { id: req.params.fileId },
        include: { message: true },
      });

      if (!file || file.roomId !== req.params.roomId) {
        return res.status(404).json({ error: "File not found" });
      }

      if (file.uploadedById !== user.id) {
        const membership = await prisma.roomMember.findUnique({
          where: {
            roomId_userId: { roomId: req.params.roomId, userId: user.id },
          },
        });
        if (!membership || membership.role !== "admin") {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      await deleteFile(file.s3Key);
      await prisma.file.delete({ where: { id: req.params.fileId } });

      if (file.message) {
        io.to(`room:${req.params.roomId}`).emit("message:delete", {
          messageId: file.message.id,
        });
      }

      res.json({ message: "File deleted" });
    } catch (err) {
      console.error("File delete error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);
