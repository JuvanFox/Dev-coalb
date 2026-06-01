import { Server as SocketIOServer, Socket } from "socket.io";
import {
  createWebRtcTransport,
  connectTransport,
  produceAudio,
  consumeAudio,
  produceVideo,
  consumeVideo,
  stopScreenShare,
  removeUserFromChannel,
  getActiveProducers,
  getActiveVideoProducers,
  getOrCreateRouter,
} from "./mediasoup";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  displayName?: string;
  avatarUrl?: string | null;
}

// Map channelId -> Set<Socket.id>
const voiceChannelMembers = new Map<string, Set<string>>();

export function setupVoiceSignaling(io: SocketIOServer, socket: AuthenticatedSocket) {
  // ─── Join Voice Channel ───────────────────────────────
  socket.on(
    "voice:join",
    async (
      data: { channelId: string; roomId: string },
      callback: (response: any) => void
    ) => {
      try {
        const { channelId } = data;

        // Get or create router, then get its RTP capabilities
        const channelRouter = await getOrCreateRouter(channelId);
        const router = channelRouter.router;

        // Create TWO transports: one for sending, one for receiving
        // (mediasoup-client requires separate send/recv transport instances)
        const sendTransport = await createWebRtcTransport(channelId);
        const recvTransport = await createWebRtcTransport(channelId);

        // Store transport references on socket
        (socket as any).sendTransport = sendTransport;
        (socket as any).recvTransport = recvTransport;
        (socket as any).voiceChannelId = channelId;

        // Track membership
        if (!voiceChannelMembers.has(channelId)) {
          voiceChannelMembers.set(channelId, new Set());
        }
        voiceChannelMembers.get(channelId)!.add(socket.id);
        socket.join(`voice:${channelId}`);

        // Notify others
        socket.to(`voice:${channelId}`).emit("voice:user-joined", {
          userId: socket.userId,
          displayName: socket.displayName,
        });

        // Send back transport parameters, router capabilities, and existing producers
        callback({
          rtpCapabilities: router.rtpCapabilities,
          sendTransportOptions: {
            id: sendTransport.id,
            iceParameters: sendTransport.iceParameters,
            iceCandidates: sendTransport.iceCandidates,
            dtlsParameters: sendTransport.dtlsParameters,
          },
          recvTransportOptions: {
            id: recvTransport.id,
            iceParameters: recvTransport.iceParameters,
            iceCandidates: recvTransport.iceCandidates,
            dtlsParameters: recvTransport.dtlsParameters,
          },
          producers: getActiveProducers(channelId).map((p) => ({
            producerId: p.id,
            userId: (p.appData as any)?.userId,
          })),
          screenProducers: getActiveVideoProducers(channelId).map((p) => ({
            producerId: p.id,
            userId: (p.appData as any)?.userId,
          })),
        });
      } catch (err) {
        console.error("[voice] Join error:", err);
        callback({ error: "Failed to join voice channel" });
      }
    }
  );

  // ─── Connect Transport ────────────────────────────────
  socket.on(
    "voice:connect-transport",
    async (
      data: { dtlsParameters: any; transportType: "send" | "recv" },
      callback: (response: any) => void
    ) => {
      try {
        const transport =
          data.transportType === "send"
            ? (socket as any).sendTransport
            : (socket as any).recvTransport;

        if (!transport) {
          return callback({ error: `No ${data.transportType} transport found` });
        }

        await connectTransport(transport, data.dtlsParameters);
        callback({ success: true });
      } catch (err) {
        console.error("[voice] Connect transport error:", err);
        callback({ error: "Failed to connect transport" });
      }
    }
  );

  // ─── Produce Audio ────────────────────────────────────
  socket.on(
    "voice:produce",
    async (
      data: { channelId: string; rtpParameters: any },
      callback: (response: any) => void
    ) => {
      try {
        const transport = (socket as any).sendTransport;
        if (!transport) {
          return callback({ error: "No send transport found" });
        }

        const producer = await produceAudio(
          transport,
          data.channelId,
          socket.userId!,
          data.rtpParameters
        );

        (producer.appData as any) = { userId: socket.userId };

        callback({ producerId: producer.id });

        // Notify other users in the channel
        socket.to(`voice:${data.channelId}`).emit("voice:new-producer", {
          producerId: producer.id,
          userId: socket.userId,
        });
      } catch (err) {
        console.error("[voice] Produce error:", err);
        callback({ error: "Failed to produce audio" });
      }
    }
  );

  // ─── Consume Audio ────────────────────────────────────
  socket.on(
    "voice:consume",
    async (
      data: {
        channelId: string;
        producerId: string;
        rtpCapabilities: any;
      },
      callback: (response: any) => void
    ) => {
      try {
        const transport = (socket as any).recvTransport;
        if (!transport) {
          return callback({ error: "No recv transport found" });
        }

        const consumer = await consumeAudio(
          transport,
          data.channelId,
          socket.userId!,
          data.producerId,
          data.rtpCapabilities
        );

        if (!consumer) {
          return callback({ error: "Cannot consume" });
        }

        callback({
          consumerId: consumer.id,
          producerId: data.producerId,
          rtpParameters: consumer.rtpParameters,
        });
      } catch (err) {
        console.error("[voice] Consume error:", err);
        callback({ error: "Failed to consume audio" });
      }
    }
  );

  // ─── Resume Consumer ──────────────────────────────────
  socket.on(
    "voice:resume-consumer",
    async (data: { consumerId: string }, callback: (response: any) => void) => {
      // Client-side resume is typically handled automatically
      callback({ success: true });
    }
  );

  // ═══════════════════════════════════════════════════════
  //  SCREEN SHARE SIGNALING
  // ═══════════════════════════════════════════════════════

  // ─── Produce Screen Share ────────────────────────────
  socket.on(
    "screen:produce",
    async (
      data: { channelId: string; rtpParameters: any },
      callback: (response: any) => void
    ) => {
      try {
        const transport = (socket as any).sendTransport;
        if (!transport) {
          return callback({ error: "No send transport found" });
        }

        const producer = await produceVideo(
          transport,
          data.channelId,
          socket.userId!,
          data.rtpParameters
        );

        (producer.appData as any) = { userId: socket.userId };

        callback({ producerId: producer.id });

        // Notify other users in the channel
        socket.to(`voice:${data.channelId}`).emit("screen:new-producer", {
          producerId: producer.id,
          userId: socket.userId,
        });
      } catch (err) {
        console.error("[screen] Produce error:", err);
        callback({ error: "Failed to produce screen share" });
      }
    }
  );

  // ─── Consume Screen Share ────────────────────────────
  socket.on(
    "screen:consume",
    async (
      data: {
        channelId: string;
        producerId: string;
        rtpCapabilities: any;
      },
      callback: (response: any) => void
    ) => {
      try {
        const transport = (socket as any).recvTransport;
        if (!transport) {
          return callback({ error: "No recv transport found" });
        }

        const consumer = await consumeVideo(
          transport,
          data.channelId,
          socket.userId!,
          data.producerId,
          data.rtpCapabilities
        );

        if (!consumer) {
          return callback({ error: "Cannot consume screen share" });
        }

        callback({
          consumerId: consumer.id,
          producerId: data.producerId,
          rtpParameters: consumer.rtpParameters,
        });
      } catch (err) {
        console.error("[screen] Consume error:", err);
        callback({ error: "Failed to consume screen share" });
      }
    }
  );

  // ─── Stop Screen Share ───────────────────────────────
  socket.on(
    "screen:stop",
    async (data: { channelId: string }) => {
      try {
        stopScreenShare(data.channelId, socket.userId!);

        socket.to(`voice:${data.channelId}`).emit("screen:user-stopped", {
          userId: socket.userId,
        });
      } catch (err) {
        console.error("[screen] Stop error:", err);
      }
    }
  );

  // ─── Leave Voice Channel ──────────────────────────────
  socket.on("voice:leave", async (data: { channelId: string }) => {
    await leaveVoiceChannel(socket, data.channelId);
  });

  // ─── Disconnect Cleanup ───────────────────────────────
  socket.on("disconnect", async () => {
    const channelId = (socket as any).voiceChannelId;
    if (channelId) {
      await leaveVoiceChannel(socket, channelId);
    }
  });
}

async function leaveVoiceChannel(socket: AuthenticatedSocket, channelId: string) {
  try {
    removeUserFromChannel(channelId, socket.userId!);

    const members = voiceChannelMembers.get(channelId);
    if (members) {
      members.delete(socket.id);
      if (members.size === 0) {
        voiceChannelMembers.delete(channelId);
      }
    }

    socket.leave(`voice:${channelId}`);
    (socket as any).sendTransport = null;
    (socket as any).recvTransport = null;
    (socket as any).voiceChannelId = null;

    socket.to(`voice:${channelId}`).emit("voice:user-left", {
      userId: socket.userId,
    });
  } catch (err) {
    console.error("[voice] Leave error:", err);
  }
}
