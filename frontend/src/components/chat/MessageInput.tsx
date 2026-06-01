import { useState, useRef } from "react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { AudioRecorder } from "./AudioRecorder";
import { Send, Paperclip, Mic, X } from "lucide-react";

interface MessageInputProps {
  roomId: string;
}

export function MessageInput({ roomId }: MessageInputProps) {
  const [content, setContent] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const socket = getSocket();

  const handleSend = async () => {
    if (!content.trim() && !uploadedFile) return;

    try {
      // If there's a file, upload it
      if (uploadedFile) {
        setIsUploading(true);
        await api.uploadFile(roomId, uploadedFile, content.trim() || undefined);
        setUploadedFile(null);
        setContent("");
        setIsUploading(false);
        return;
      }

      // Otherwise send text message
      await api.sendMessage(roomId, { content: content.trim() });
      setContent("");
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  // Typing indicators
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    socket.emit("typing:start", { roomId });
    // Stop typing after 2 seconds of no input
    clearTimeout((window as any).typingTimeout);
    (window as any).typingTimeout = setTimeout(() => {
      socket.emit("typing:stop", { roomId });
    }, 2000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
    }
  };

  const handleAudioComplete = async (blob: Blob) => {
    console.log(`[MessageInput] Audio complete received: type='${blob.type}' size=${blob.size} bytes`);
    try {
      setIsUploading(true);
      console.log(`[MessageInput] Calling api.uploadAudio(roomId='${roomId}', blob size=${blob.size})`);
      const result = await api.uploadAudio(roomId, blob);
      console.log(`[MessageInput] ✅ Audio uploaded successfully:`, result);
      setIsUploading(false);
      setIsRecording(false);
    } catch (err) {
      console.error("[MessageInput] ❌ Failed to upload audio:", err);
      setIsUploading(false);
    }
  };

  return (
    <div className="px-4 pb-4 pt-2 shrink-0">
      {/* File preview */}
      {uploadedFile && (
        <div className="flex items-center gap-2 p-2 mb-2 rounded-lg bg-sidebar-hover">
          <Paperclip className="w-4 h-4 text-primary" />
          <span className="text-sm truncate flex-1">{uploadedFile.name}</span>
          <button
            onClick={() => {
              setUploadedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Audio recorder overlay */}
      {isRecording && (
        <div className="mb-2">
          <AudioRecorder
            onComplete={handleAudioComplete}
            onCancel={() => setIsRecording(false)}
          />
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-end gap-2 bg-sidebar-hover rounded-lg px-3 py-2">
        {/* File upload button */}
        {!isRecording && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-muted-foreground hover:text-foreground p-1"
              title="Attach file"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
            />
          </>
        )}

        {/* Text input */}
        {!isRecording && (
          <textarea
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={`Message #${roomId.slice(0, 8)}`}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none max-h-32 py-1"
            rows={1}
          />
        )}

        {/* Action buttons */}
        {isRecording ? (
          <span className="text-xs text-destructive animate-pulse">Recording...</span>
        ) : (
          <>
            {/* Mic button */}
            <button
              onClick={() => setIsRecording(true)}
              className="text-muted-foreground hover:text-foreground p-1"
              title="Record audio"
            >
              <Mic className="w-5 h-5" />
            </button>

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={(!content.trim() && !uploadedFile) || isUploading}
              className="text-primary hover:text-primary/80 disabled:text-muted-foreground p-1 disabled:opacity-50"
              title="Send"
            >
              <Send className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
