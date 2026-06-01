import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "4000", 10),

  DATABASE_URL: process.env.DATABASE_URL || "postgresql://devcollab:devcollab_secret@localhost:5432/devcollab",
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",

  S3_ENDPOINT: process.env.S3_ENDPOINT || "http://localhost:4566",
  S3_REGION: process.env.S3_REGION || "us-east-1",
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || "test",
  S3_SECRET_KEY: process.env.S3_SECRET_KEY || "test",
  S3_BUCKET: process.env.S3_BUCKET || "devcollab-files",

  JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-in-production",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || "",
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || "",

  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",

  ANNOUNCED_IP: process.env.ANNOUNCED_IP || "127.0.0.1",
} as const;
