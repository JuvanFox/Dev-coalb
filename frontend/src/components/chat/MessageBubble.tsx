import { useState, useRef, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDate, formatFileSize, getInitials, cn } from "@/lib/utils";
import { FileIcon, Trash2, Download, Play, Pause, Image, Music, FileText, Film, Plus } from "lucide-react";
import { EmojiPicker } from "./EmojiPicker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MessageBubbleProps {
  message: any;
  showAuthor: boolean;
  isOwn: boolean;
}

// ─── Audio Player Component ──────────────────────────────────
function AudioPlayer({ blobUrl, file }: { blobUrl: string; file: any }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(blobUrl);
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      // Guard against Infinity/NaN for invalid/corrupt audio files
      if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      } else {
        setDuration(0);
      }
    });
    audio.addEventListener("timeupdate", () => {
      if (isFinite(audio.currentTime)) {
        setCurrentTime(audio.currentTime);
      }
    });
    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [blobUrl]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    audio.currentTime = percent * duration;
    setCurrentTime(audio.currentTime);
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 && isFinite(duration) ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-sidebar-hover mt-1 max-w-sm min-w-[260px]">
      <button
        onClick={togglePlay}
        className="w-9 h-9 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors shrink-0"
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 text-white" />
        ) : (
          <Play className="w-4 h-4 text-white ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        {/* Progress bar (clickable) - only show seekable if we have duration */}
        <div
          className={`h-2 bg-muted rounded-full overflow-hidden ${duration > 0 ? "cursor-pointer group relative" : ""}`}
          onClick={duration > 0 ? handleSeek : undefined}
        >
          <div
            className="h-full bg-primary rounded-full transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
          {duration > 0 && (
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-foreground/5 rounded-full transition-opacity" />
          )}
        </div>

        {/* Time display */}
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">
            {formatTime(currentTime)}
          </span>
          <span className="text-xs text-muted-foreground">
            {duration > 0 ? formatTime(duration) : "--:--"}
          </span>
        </div>
      </div>

      <span className="text-xs text-muted-foreground shrink-0">
        {formatFileSize(file.size)}
      </span>
    </div>
  );
}

// ─── File Preview Dialog ────────────────────────────────────
function FilePreviewDialog({
  file,
  roomId,
  open,
  onOpenChange,
}: {
  file: any;
  roomId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !file) return;

    setIsLoading(true);
    setError(null);

    api
      .getFileBlob(roomId, file.id)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load file preview:", err);
        setError("Could not load file");
        setIsLoading(false);
      });

    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [open, file?.id, roomId]);

  const isImage = file?.mimeType?.startsWith("image/");
  const isAudio = file?.mimeType?.startsWith("audio/");
  const isVideo = file?.mimeType?.startsWith("video/");
  const isPdf = file?.mimeType === "application/pdf";

  const getFileIcon = () => {
    if (isImage) return <Image className="w-12 h-12 text-primary" />;
    if (isAudio) return <Music className="w-12 h-12 text-primary" />;
    if (isVideo) return <Film className="w-12 h-12 text-primary" />;
    return <FileText className="w-12 h-12 text-primary" />;
  };

  const handleDownload = async () => {
    try {
      const blob = await api.getFileBlob(roomId, file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{file?.filename}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {isLoading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Loading preview...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-destructive mb-2">{error}</p>
              <button
                onClick={handleDownload}
                className="text-sm text-primary hover:underline"
              >
                Download file instead
              </button>
            </div>
          )}

          {previewUrl && !isLoading && (
            <>
              {/* Image preview */}
              {isImage && (
                <img
                  src={previewUrl}
                  alt={file.filename}
                  className="max-w-full max-h-[60vh] object-contain rounded-lg"
                />
              )}

              {/* Audio player */}
              {isAudio && (
                <div className="w-full max-w-md py-4">
                  <audio src={previewUrl} controls className="w-full" />
                </div>
              )}

              {/* Video player */}
              {isVideo && (
                <video
                  src={previewUrl}
                  controls
                  className="max-w-full max-h-[60vh] rounded-lg"
                />
              )}

              {/* PDF or other documents */}
              {isPdf && (
                <iframe
                  src={previewUrl}
                  className="w-full h-[70vh] rounded-lg border"
                  title={file.filename}
                />
              )}

              {/* Fallback for other file types */}
              {!isImage && !isAudio && !isVideo && !isPdf && (
                <div className="flex flex-col items-center gap-3 py-8">
                  {getFileIcon()}
                  <p className="text-sm font-medium">{file.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Download button */}
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main MessageBubble ─────────────────────────────────────
export function MessageBubble({ message, showAuthor, isOwn }: MessageBubbleProps) {
  const { user } = useAuthStore();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [previewFile, setPreviewFile] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Delete this message?")) return;
    try {
      await api.deleteMessage(message.roomId, message.id);
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const handleDownload = async () => {
    if (!message.file) return;
    try {
      const blob = await api.getFileBlob(message.roomId, message.file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = message.file.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[MessageBubble] ❌ Failed to download file:", err);
    }
  };

  const handleViewFile = () => {
    if (!message.file) return;
    setPreviewFile(message.file);
    setPreviewOpen(true);
  };

  const handlePlayAudio = async () => {
    if (!message.file) return;
    if (audioUrl) return; // Already loaded

    setIsLoadingAudio(true);
    try {
      const blob = await api.getFileBlob(message.roomId, message.file.id);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (err) {
      console.error("[MessageBubble] ❌ Failed to load audio:", err);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const isAudio = message.contentType === "audio";
  const isFile = message.contentType === "file";
  const isImage = isFile && message.file?.mimeType?.startsWith("image/");

  // Group reactions by emoji, showing count and who reacted
  const reactionEmojis = message.reactions?.reduce((acc: any, r: any) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, users: [], reacted: false };
    acc[r.emoji].count++;
    acc[r.emoji].users.push(r.user.displayName);
    if (r.user.id === user?.id) acc[r.emoji].reacted = true;
    return acc;
  }, {} as Record<string, { count: number; users: string[]; reacted: boolean }>) || {};

  const handleToggleReaction = async (emoji: string) => {
    try {
      await api.toggleReaction(message.roomId, message.id, emoji);
    } catch (err) {
      console.error("Failed to toggle reaction:", err);
    }
  };

  const renderReactions = () => {
    const entries = Object.entries(reactionEmojis) as [string, { count: number; users: string[]; reacted: boolean }][];
    if (entries.length === 0) return null;

    return (
      <div className="flex flex-wrap items-center gap-1 mt-2">
        {entries.map(([emoji, data]) => (
          <button
            key={emoji}
            onClick={() => handleToggleReaction(emoji)}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors",
              data.reacted
                ? "bg-primary/20 border-primary/40 text-primary"
                : "bg-sidebar-hover border-transparent hover:border-border text-muted-foreground"
            )}
            title={data.users.join(", ")}
          >
            <span>{emoji}</span>
            <span>{data.count}</span>
          </button>
        ))}
        {/* Add reaction button */}
        <EmojiPicker onEmojiSelect={handleToggleReaction}>
          <button className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-sidebar-hover hover:bg-sidebar-active text-muted-foreground hover:text-foreground transition-colors">
            <Plus className="w-3 h-3" />
          </button>
        </EmojiPicker>
      </div>
    );
  };

  return (
    <>
      <div className={cn("message-row group", showAuthor ? "mt-4" : "mt-0.5")}>
        <div className="flex gap-3">
          {/* Avatar */}
          {showAuthor ? (
            <Avatar className="w-10 h-10 mt-0.5 shrink-0">
              <AvatarImage src={message.user.avatarUrl || undefined} />
              <AvatarFallback className="text-xs">
                {getInitials(message.user.displayName)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="w-10 shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            {/* Author & time */}
            {showAuthor && (
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-semibold text-sm hover:underline cursor-pointer">
                  {message.user.displayName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(message.createdAt)}
                </span>
              </div>
            )}

            {/* Text content */}
            {message.content && !isFile && !isAudio && (
              <p className="text-sm whitespace-pre-wrap break-words">
                {message.content}
              </p>
            )}

            {/* File attachment (clickable to open preview) */}
            {isFile && message.file && !isImage && (
              <div
                onClick={handleViewFile}
                className="flex items-center gap-3 p-3 rounded-lg bg-sidebar-hover mt-1 max-w-md cursor-pointer hover:bg-sidebar-hover/80 transition-colors"
              >
                <div className="w-10 h-10 rounded bg-primary/20 flex items-center justify-center shrink-0">
                  <FileIcon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{message.file.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(message.file.size)}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload();
                  }}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Image attachment (clickable to open preview) */}
            {isFile && isImage && message.file && (
              <div
                onClick={handleViewFile}
                className="mt-1 max-w-sm cursor-pointer group relative overflow-hidden rounded-lg"
              >
                <div className="w-32 h-32 bg-sidebar-hover rounded-lg flex items-center justify-center">
                  <Image className="w-8 h-8 text-muted-foreground" />
                </div>
              </div>
            )}

            {/* Audio message */}
            {isAudio && message.file && (
              <>
                {isLoadingAudio ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-sidebar-hover mt-1 max-w-sm">
                    <div className="w-9 h-9 rounded-full bg-primary/50 animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-2 bg-muted rounded-full" />
                      <div className="flex justify-between">
                        <div className="h-3 bg-muted rounded w-8" />
                        <div className="h-3 bg-muted rounded w-8" />
                      </div>
                    </div>
                  </div>
                ) : audioUrl ? (
                  <AudioPlayer blobUrl={audioUrl} file={message.file} />
                ) : (
                  <div
                    onClick={handlePlayAudio}
                    className="flex items-center gap-3 p-3 rounded-lg bg-sidebar-hover mt-1 max-w-sm cursor-pointer hover:bg-sidebar-hover/80 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
                      <Play className="w-4 h-4 text-white ml-0.5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Voice message</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(message.file.size)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="w-1 h-4 bg-primary/40 rounded-full"
                          style={{ height: `${12 + i * 6}px` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Reply count */}
            {message._count?.replies > 0 && (
              <button className="text-xs text-primary hover:underline mt-1">
                {message._count.replies} {message._count.replies === 1 ? "reply" : "replies"}
              </button>
            )}

            {/* Reactions */}
            {renderReactions()}
          </div>

          {/* Message actions */}
          {isOwn && (
            <div className="message-actions flex gap-1">
              <button
                onClick={handleDelete}
                className="text-muted-foreground hover:text-destructive p-1"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* File Preview Dialog */}
      <FilePreviewDialog
        file={previewFile}
        roomId={message.roomId}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </>
  );
}
