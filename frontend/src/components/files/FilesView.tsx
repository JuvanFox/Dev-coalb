import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDate, formatFileSize } from "@/lib/utils";
import {
  FileIcon,
  Upload,
  Download,
  Trash2,
  Music,
  Image,
  FileCode,
  Archive,
  FileText,
} from "lucide-react";

interface FilesViewProps {
  room: any;
}

export function FilesView({ room }: FilesViewProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    try {
      // Get all messages and filter file ones
      const res = await api.getMessages(room.id);
      const fileMessages = res.messages.filter(
        (m: any) => m.contentType === "file" && m.file
      );
      setMessages(fileMessages);
    } catch (err) {
      console.error("Failed to fetch files:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    fetchFiles();
  }, [room.id]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await api.uploadFile(room.id, file);
      fetchFiles();
    } catch (err) {
      console.error("Failed to upload:", err);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownload = async (file: any) => {
    try {
      const res = await api.getFileDownloadUrl(room.id, file.id);
      window.open(res.url, "_blank");
    } catch (err) {
      console.error("Failed to download:", err);
    }
  };

  const handleDelete = async (file: any) => {
    if (!confirm("Delete this file?")) return;
    try {
      await api.deleteFile(room.id, file.id);
      fetchFiles();
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return Image;
    if (mimeType.startsWith("audio/")) return Music;
    if (mimeType.includes("javascript") || mimeType.includes("json") || mimeType.includes("html"))
      return FileCode;
    if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("rar"))
      return Archive;
    return FileText;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">Files</h2>
        <Button size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-4 h-4 mr-1" />
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-sidebar-hover rounded-lg animate-pulse" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <FileIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No files shared yet</p>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {messages.map((msg) => {
              const file = msg.file;
              const FileIconComponent = getFileIcon(file.mimeType);
              return (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded bg-primary/20 flex items-center justify-center shrink-0">
                    <FileIconComponent className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)} · {msg.user.displayName} ·{" "}
                      {formatDate(file.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDownload(file)}
                      className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-sidebar-hover"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(file)}
                      className="text-muted-foreground hover:text-destructive p-1.5 rounded hover:bg-sidebar-hover"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
