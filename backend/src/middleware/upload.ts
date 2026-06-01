import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const ALLOWED_MIME_TYPES = [
  // Documents
  "text/plain",
  "text/html",
  "text/css",
  "text/javascript",
  "application/json",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Code
  "application/zip",
  "application/x-tar",
  "application/gzip",
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Audio
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/mp4",
  // Video
  "video/mp4",
  "video/webm",
  // Archives
  "application/x-rar-compressed",
  "application/x-7z-compressed",
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    // Strip parameters (e.g., ";codecs=opus") from the mime type
    const baseType = file.mimetype.split(";")[0].trim();
    if (ALLOWED_MIME_TYPES.includes(baseType)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

export function generateS3Key(roomId: string, filename: string): string {
  const ext = path.extname(filename);
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `rooms/${roomId}/${uuidv4()}${ext}`;
}
