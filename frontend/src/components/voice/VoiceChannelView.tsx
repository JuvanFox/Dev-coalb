import { useState, useRef, useEffect, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/auth";
import { Mic, MicOff, PhoneOff, Monitor, MonitorOff, Headphones, VolumeX } from "lucide-react";
import { playVoiceJoinSound, playVoiceActivitySound, playPTTActivateSound, playPTTDeactivateSound } from "@/lib/sounds";

interface VoiceChannelViewProps {
  channelId: string;
  roomId: string;
  channelName: string;
  onLeave: () => void;
}

export function VoiceChannelView({ channelId, roomId, channelName, onLeave }: VoiceChannelViewProps) {
  const { user } = useAuthStore();
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [audioLevels, setAudioLevels] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isPTTActive, setIsPTTActive] = useState(false);
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());

  const deviceRef = useRef<any>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const audioProducerRef = useRef<any>(null);
  const screenProducerRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  // Stores: producerId -> { consumer, audioEl, userId }
  const remoteConsumersRef = useRef<Map<string, { consumer: any; audioEl: HTMLAudioElement; userId: string }>>(new Map());
  const audioContainerRef = useRef<HTMLDivElement | null>(null);

  // ─── Join Voice Channel ──────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;

    async function joinVoice() {
      try {
        setIsConnecting(true);

        // Dynamic import mediasoup-client
        const mediasoupClient = await import("mediasoup-client");

        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;

        // Create a device
        const device = new mediasoupClient.default.Device();
        deviceRef.current = device;

        // Join the voice channel via socket
        const response = await new Promise<any>((resolve, reject) => {
          socket.emit("voice:join", { channelId, roomId }, (resp: any) => {
            if (resp.error) reject(new Error(resp.error));
            else resolve(resp);
          });
        });

        if (cancelled) return;

        // Load device with router RTP capabilities
        await device.load({ routerRtpCapabilities: response.rtpCapabilities });

        // Create send transport
        const sendTransport = device.createSendTransport({
          ...response.sendTransportOptions,
        });
        sendTransportRef.current = sendTransport;

        sendTransport.on("connect", ({ dtlsParameters }: any, callback: any) => {
          socket.emit("voice:connect-transport", {
            dtlsParameters,
            transportType: "send",
          }, (resp: any) => {
            if (resp.error) callback(new Error(resp.error));
            else callback();
          });
        });

        sendTransport.on("produce", ({ kind, rtpParameters }: any, callback: any) => {
          socket.emit("voice:produce", { channelId, rtpParameters }, (resp: any) => {
            if (resp.error) callback(new Error(resp.error));
            else callback({ id: resp.producerId });
          });
        });

        sendTransport.on("connectionstatechange", (state: string) => {
          if (state === "failed" || state === "disconnected") {
            console.warn("[voice] Send transport state:", state);
          }
        });

        // Create recv transport
        const recvTransport = device.createRecvTransport({
          ...response.recvTransportOptions,
        });
        recvTransportRef.current = recvTransport;

        recvTransport.on("connect", ({ dtlsParameters }: any, callback: any) => {
          socket.emit("voice:connect-transport", {
            dtlsParameters,
            transportType: "recv",
          }, (resp: any) => {
            if (resp.error) callback(new Error(resp.error));
            else callback();
          });
        });

        recvTransport.on("connectionstatechange", (state: string) => {
          if (state === "failed" || state === "disconnected") {
            console.warn("[voice] Recv transport state:", state);
          }
        });

        // Produce audio from mic
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          const producer = await sendTransport.produce({ track: audioTrack });
          audioProducerRef.current = producer;
        }

        // Consume existing producers (pass userId for proper tracking)
        for (const p of response.producers || []) {
          if (p.userId !== user?.id) {
            consumeAudioProducer(recvTransport, channelId, p.producerId, p.userId);
          }
        }

        // Existing screen shares
        for (const sp of response.screenProducers || []) {
          if (sp.userId !== user?.id) {
            consumeScreenProducer(recvTransport, channelId, sp.producerId);
          }
        }

        if (!cancelled) {
          setIsConnecting(false);
          setError(null);
        }
      } catch (err: any) {
        console.error("[voice] Failed to join:", err);
        if (!cancelled) {
          setError(err.message || "Failed to join voice channel");
          setIsConnecting(false);
        }
      }
    }

    joinVoice();

    return () => {
      cancelled = true;
      cleanupResources();
    };
  }, [channelId, roomId]);

  // ─── Socket Event Listeners ──────────────────────────
  useEffect(() => {
    const socket = getSocket();

    const handleUserJoined = (data: { userId: string; displayName: string }) => {
      setMembers((prev) => [...prev, data]);
      // Play sound when someone joins (skip if it's yourself - already handled on your side)
      if (data.userId !== user?.id) {
        playVoiceJoinSound();
      }
    };

    const handleUserLeft = (data: { userId: string }) => {
      setMembers((prev) => prev.filter((m) => m.userId !== data.userId));
      // Clean up all consumers/producers for this user
      remoteConsumersRef.current.forEach((entry, producerId) => {
        if (entry.userId === data.userId) {
          try { entry.audioEl.pause(); } catch {}
          try { entry.audioEl.srcObject = null; } catch {}
          try { entry.audioEl.remove(); } catch {}
          try { entry.consumer.close(); } catch {}
          remoteConsumersRef.current.delete(producerId);
        }
      });
    };

    const handleNewProducer = (data: { producerId: string; userId: string }) => {
      if (data.userId !== user?.id && recvTransportRef.current) {
        consumeAudioProducer(recvTransportRef.current, channelId, data.producerId, data.userId);
        // Play subtle sound when someone starts speaking
        playVoiceActivitySound();
      }
    };

    socket.on("voice:user-joined", handleUserJoined);
    socket.on("voice:user-left", handleUserLeft);
    socket.on("voice:new-producer", handleNewProducer);

    return () => {
      socket.off("voice:user-joined", handleUserJoined);
      socket.off("voice:user-left", handleUserLeft);
      socket.off("voice:new-producer", handleNewProducer);
    };
  }, [channelId, user?.id]);

  // ─── Consume Audio Producer ──────────────────────────
  const consumeAudioProducer = useCallback(async (transport: any, chId: string, producerId: string, userId: string) => {
    const socket = getSocket();
    try {
      const device = deviceRef.current;
      if (!device) return;

      const rtpCapabilities = device.rtpCapabilities;

      socket.emit("voice:consume", {
        channelId: chId,
        producerId,
        rtpCapabilities,
      }, async (response: any) => {
        if (response.error) {
          console.warn("[voice] Failed to consume:", response.error);
          return;
        }

        try {
          const consumer = await transport.consume({
            id: response.consumerId,
            producerId: response.producerId,
            kind: "audio",
            rtpParameters: response.rtpParameters,
          });

          // Create audio element and APPEND to hidden container
          const audioStream = new MediaStream([consumer.track]);
          const audioEl = document.createElement("audio");

          // Must be appended to DOM for autoplay to work in most browsers
          if (!audioContainerRef.current) {
            const div = document.createElement("div");
            div.id = "voice-audio-container";
            div.style.display = "none";
            document.body.appendChild(div);
            audioContainerRef.current = div;
          }
          audioContainerRef.current.appendChild(audioEl);

          audioEl.srcObject = audioStream;
          audioEl.autoplay = true;
          audioEl.play().catch((err) => {
            // Browser may reject autoplay — try again on first user gesture
            console.debug("[voice] Audio play blocked, will retry:", err.message);
            const retryPlay = () => {
              audioEl.play().catch(() => {});
              document.removeEventListener("click", retryPlay);
              document.removeEventListener("keydown", retryPlay);
            };
            document.addEventListener("click", retryPlay, { once: true });
            document.addEventListener("keydown", retryPlay, { once: true });
          });

          // Store by producerId for cleanup
          remoteConsumersRef.current.set(producerId, { consumer, audioEl, userId });
        } catch (err) {
          console.error("[voice] Consumer error:", err);
        }
      });
    } catch (err) {
      console.error("[voice] consumeAudioProducer error:", err);
    }
  }, []);

  // ─── Consume Screen Producer ─────────────────────────
  const consumeScreenProducer = useCallback(async (transport: any, chId: string, producerId: string) => {
    const socket = getSocket();
    try {
      const device = deviceRef.current;
      if (!device) return;

      const rtpCapabilities = device.rtpCapabilities;

      socket.emit("screen:consume", {
        channelId: chId,
        producerId,
        rtpCapabilities,
      }, async (response: any) => {
        if (response.error) {
          console.warn("[screen] Failed to consume:", response.error);
          return;
        }

        try {
          const consumer = await transport.consume({
            id: response.consumerId,
            producerId: response.producerId,
            kind: "video",
            rtpParameters: response.rtpParameters,
          });

          const videoStream = new MediaStream([consumer.track]);
          // TODO: render the screen share video somewhere
        } catch (err) {
          console.error("[screen] Consumer error:", err);
        }
      });
    } catch (err) {
      console.error("[screen] consumeScreenProducer error:", err);
    }
  }, []);

  // ─── Toggle Mute ────────────────────────────────────
  // Toggles between PTT mode (track disabled, Space to talk) and fully muted
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      // In both PTT mode and fully muted, the track is disabled.
      // Toggling just changes whether PTT (Space) can enable it.
      audioTrack.enabled = false;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  // ─── Toggle Deafen ──────────────────────────────────
  const toggleDeafen = useCallback(() => {
    setIsDeafened(!isDeafened);
    // Mute/unmute all remote audio elements
    remoteConsumersRef.current.forEach((entry) => {
      entry.audioEl.muted = !isDeafened;
    });
  }, [isDeafened]);

  // ─── Toggle Screen Share ────────────────────────────
  const toggleScreenShare = useCallback(async () => {
    const socket = getSocket();
    if (isSharingScreen) {
      // Stop sharing
      if (screenProducerRef.current) {
        screenProducerRef.current.close();
        screenProducerRef.current = null;
      }
      socket.emit("screen:stop", { channelId });
      setIsSharingScreen(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        const videoTrack = stream.getVideoTracks()[0];
        videoTrack.onended = () => {
          // User stopped sharing via browser UI
          if (screenProducerRef.current) {
            screenProducerRef.current.close();
            screenProducerRef.current = null;
          }
          socket.emit("screen:stop", { channelId });
          setIsSharingScreen(false);
        };

        if (sendTransportRef.current) {
          const producer = await sendTransportRef.current.produce({ track: videoTrack });
          screenProducerRef.current = producer;
          setIsSharingScreen(true);
        }
      } catch (err) {
        console.error("[screen] Failed to start sharing:", err);
      }
    }
  }, [isSharingScreen, channelId]);

  // ─── Leave (called explicitly by user) ───────────────
  const handleLeave = useCallback(() => {
    // Send leave event BEFORE React unmounts
    const socket = getSocket();
    socket.emit("voice:leave", { channelId });
    cleanupResources();
    onLeave();
  }, [channelId, onLeave]);

  // ─── Cleanup Resources (safe, won't throw) ───────────
  const cleanupResources = useCallback(() => {
    try {
      // Close producers
      if (audioProducerRef.current) {
        audioProducerRef.current.close();
        audioProducerRef.current = null;
      }
      if (screenProducerRef.current) {
        screenProducerRef.current.close();
        screenProducerRef.current = null;
      }

      // Close transports
      if (sendTransportRef.current) {
        try { sendTransportRef.current.close(); } catch {}
        sendTransportRef.current = null;
      }
      if (recvTransportRef.current) {
        try { recvTransportRef.current.close(); } catch {}
        recvTransportRef.current = null;
      }

      // Stop local media tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch {}
        });
        localStreamRef.current = null;
      }

      // Clean up remote audio elements and consumers
      remoteConsumersRef.current.forEach((entry) => {
        try {
          entry.audioEl.pause();
          entry.audioEl.srcObject = null;
          entry.audioEl.remove();
          entry.consumer.close();
        } catch {}
      });
      remoteConsumersRef.current.clear();

      // Close device
      if (deviceRef.current) {
        try { deviceRef.current.close(); } catch {}
        deviceRef.current = null;
      }
    } catch (err) {
      console.warn("[voice] Cleanup error (non-fatal):", err);
    }
  }, []);

  // ─── Push-to-Talk ───────────────────────────────────
  // In PTT mode: mic track starts DISABLED (muted by default)
  // Hold Space → enable track (others hear you)
  // Release Space → disable track (others don't hear you)
  // Click mute button → completely mute (track disabled, PTT inactive)
  // Click unmute → back to PTT mode (track disabled, PTT active)

  useEffect(() => {
    // When not muted, enter PTT mode: mic disabled by default
    if (!isMuted) {
      const stream = localStreamRef.current;
      if (stream) {
        const track = stream.getAudioTracks()[0];
        if (track) track.enabled = false; // Start muted in PTT mode
      }
    }
  }, [isMuted]);

  useEffect(() => {
    // Don't install push-to-talk if user is muted (mute toggle overrides)
    if (isMuted) return;

    const isInputElement = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || el.getAttribute("role") === "textbox";
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;

      // If user is focused on a text input, let Space pass through normally
      if (isInputElement(document.activeElement)) return;

      // Intercept Space for push-to-talk
      e.preventDefault(); // Prevent space from being typed
      setIsPTTActive(true);
      playPTTActivateSound();

      // Enable mic track — others will hear you
      const stream = localStreamRef.current;
      if (stream) {
        const track = stream.getAudioTracks()[0];
        if (track) track.enabled = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;

      // If user is focused on a text input, do nothing
      if (isInputElement(document.activeElement)) return;

      e.preventDefault();
      setIsPTTActive(false);
      playPTTDeactivateSound();

      // Disable mic track — others stop hearing you
      const stream = localStreamRef.current;
      if (stream) {
        const track = stream.getAudioTracks()[0];
        if (track) track.enabled = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      setIsPTTActive(false);
      // Re-mute mic on unmount if PTT was active
      const stream = localStreamRef.current;
      if (stream) {
        const track = stream.getAudioTracks()[0];
        if (track) track.enabled = false;
      }
    };
  }, [isMuted]);

  // ─── Render ──────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-sidebar-hover border border-border">
      {/* Channel name & connection status */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${isConnecting ? "bg-yellow-500 animate-pulse" : error ? "bg-destructive" : "bg-green-500"}`} />
        <span className="text-sm font-medium">{channelName}</span>
        {!isConnecting && !error && (
          <span className="text-xs text-muted-foreground">
            ({members.length + 1} connected)
          </span>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}

      {isConnecting && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Connecting to voice channel...
        </div>
      )}

      {/* Control buttons */}
      {!isConnecting && !error && (
        <div className="flex items-center gap-2">
          {/* Mute/Unmute */}
          <button
            onClick={toggleMute}
            className={`p-2 rounded-full transition-colors relative ${
              isMuted
                ? "bg-destructive text-white hover:bg-destructive/90"
                : isPTTActive
                ? "bg-green-600 text-white"
                : "bg-sidebar-active text-foreground hover:bg-sidebar-hover"
            }`}
            title={
              isMuted
                ? "Unmute"
                : isPTTActive
                ? "Speaking... (release Space)"
                : "Mute (hold Space for push-to-talk)"
            }
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {isPTTActive && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-ping" />
            )}
          </button>

          {/* Deafen/Undeafen */}
          <button
            onClick={toggleDeafen}
            className={`p-2 rounded-full transition-colors ${
              isDeafened
                ? "bg-destructive text-white hover:bg-destructive/90"
                : "bg-sidebar-active text-foreground hover:bg-sidebar-hover"
            }`}
            title={isDeafened ? "Undeafen" : "Deafen"}
          >
            {isDeafened ? <VolumeX className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
          </button>

          {/* Screen Share */}
          <button
            onClick={toggleScreenShare}
            className={`p-2 rounded-full transition-colors ${
              isSharingScreen
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-sidebar-active text-foreground hover:bg-sidebar-hover"
            }`}
            title={isSharingScreen ? "Stop sharing" : "Share screen"}
          >
            {isSharingScreen ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
          </button>

          {/* Leave */}
          <button
            onClick={handleLeave}
            className="p-2 rounded-full bg-destructive text-white hover:bg-destructive/90 transition-colors"
            title="Leave voice channel"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Push-to-talk hint */}
      {!isMuted && !isConnecting && !error && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          {isPTTActive ? (
            <>
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-green-500 font-medium">Speaking...</span>
            </>
          ) : (
            <>
              Hold <kbd className="px-1 py-0.5 rounded bg-sidebar-active text-xs font-mono">Space</kbd>
              <span className="hidden sm:inline">for push-to-talk</span>
              <span className="inline sm:hidden">= talk</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
