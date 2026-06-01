import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Square, Send, Trash2, AlertCircle } from "lucide-react";

interface AudioRecorderProps {
  onComplete: (blob: Blob) => void;
  onCancel: () => void;
}

export function AudioRecorder({ onComplete, onCancel }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(true);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const mountedRef = useRef(true);

  // Stop everything and release resources
  function stopAll() {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch (_) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  useEffect(() => {
    mountedRef.current = true;

    async function startRecording() {
      try {
        console.log("[AudioRecorder] Starting recording...");
        console.log("[AudioRecorder] Protocol:", window.location.protocol, "Hostname:", window.location.hostname);

        // Check if the page is served over a secure context
        if (window.location.protocol !== "https:" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
          throw new Error(
            "Microphone access requires HTTPS. " +
            "Access the app via https:// or from localhost."
          );
        }

        console.log("[AudioRecorder] Requesting microphone access...");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("[AudioRecorder] ✅ Microphone access granted");
        if (!mountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "audio/mp4";

        console.log("[AudioRecorder] Using mimeType:", mimeType);

        const mediaRecorder = new MediaRecorder(stream, { mimeType });

        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
            console.log(`[AudioRecorder] Chunk received: ${e.data.size} bytes (total chunks: ${chunksRef.current.length})`);
          }
        };

        mediaRecorder.onstop = () => {
          if (!mountedRef.current) return;
          const totalSize = chunksRef.current.reduce((sum, c) => sum + c.size, 0);
          console.log(`[AudioRecorder] Recording stopped. Chunks: ${chunksRef.current.length}, Total size: ${totalSize} bytes`);
          const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
          console.log(`[AudioRecorder] Blob created: type='${blob.type}' size=${blob.size} bytes`);
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
          setIsRecording(false);
          stopAll();
        };

        mediaRecorder.onerror = () => {
          if (!mountedRef.current) return;
          console.error("[AudioRecorder] MediaRecorder error");
          setError("Recording failed. Please try again.");
          stopAll();
        };

        mediaRecorder.start();
        console.log("[AudioRecorder] MediaRecorder started");
        timerRef.current = setInterval(() => {
          if (mountedRef.current) setDuration((d) => d + 1);
        }, 1000);
      } catch (err: any) {
        if (!mountedRef.current) return;
        console.error("[AudioRecorder] Failed to start recording:", err);
        const msg = err.name === "NotAllowedError"
          ? "Microphone access denied. Check your browser permissions."
          : err.name === "NotFoundError"
            ? "No microphone found. Connect a microphone and try again."
            : err.message || "Could not access microphone.";
        setError(msg);
        setIsRecording(false);
        stopAll();
      }
    }

    startRecording();

    return () => {
      mountedRef.current = false;
      stopAll();
    };
  }, []);

  const handleStop = () => {
    mediaRecorderRef.current?.stop();
  };

  const handleSend = () => {
    console.log("[AudioRecorder] Send button clicked");
    if (chunksRef.current.length > 0 && mediaRecorderRef.current) {
      const blob = new Blob(chunksRef.current, {
        type: mediaRecorderRef.current.mimeType,
      });
      console.log(`[AudioRecorder] Sending blob: type='${blob.type}' size=${blob.size} bytes`);
      onComplete(blob);
    } else {
      console.warn("[AudioRecorder] Cannot send: no chunks or no recorder ref", {
        chunksLength: chunksRef.current.length,
        hasRecorder: !!mediaRecorderRef.current,
      });
    }
  };

  const handleCancel = () => {
    stopAll();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    onCancel();
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Error state
  if (error) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
        <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
        <p className="text-sm text-destructive flex-1">{error}</p>
        <button
          onClick={handleCancel}
          className="text-destructive hover:text-destructive/80 p-1"
          title="Dismiss"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-sidebar-hover">
      {/* Recording indicator */}
      {isRecording ? (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
          <span className="text-sm text-destructive font-medium">
            {formatDuration(duration)}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {formatDuration(duration)}
          </span>
        </div>
      )}

      {/* Audio preview / waveform */}
      <div className="flex-1">
        {audioUrl ? (
          <audio src={audioUrl} controls className="w-full h-8" />
        ) : (
          <div className="flex items-center gap-0.5 h-8">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="w-1 bg-primary/50 rounded-full animate-pulse"
                style={{
                  height: `${20 + Math.random() * 60}%`,
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {isRecording ? (
          <button
            onClick={handleStop}
            className="p-2 rounded-full bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors"
            title="Stop recording"
          >
            <Square className="w-4 h-4" />
          </button>
        ) : (
          <>
            <button
              onClick={handleSend}
              className="p-2 rounded-full bg-primary text-white hover:bg-primary/90 transition-colors"
              title="Send voice message"
            >
              <Send className="w-4 h-4" />
            </button>
            <button
              onClick={handleCancel}
              className="p-2 rounded-full text-muted-foreground hover:text-foreground transition-colors"
              title="Discard"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
