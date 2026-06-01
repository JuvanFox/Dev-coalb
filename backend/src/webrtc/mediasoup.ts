import * as mediasoup from "mediasoup";
import { types as mediasoupTypes } from "mediasoup";
import { env } from "../config/env";

// ─── Types ──────────────────────────────────────────────
export interface VoiceChannelRouter {
  router: mediasoupTypes.Router;
  producers: Map<string, mediasoupTypes.Producer>; // userId -> Audio Producer
  consumers: Map<string, Map<string, mediasoupTypes.Consumer>>; // userId -> (consumerId -> Consumer)
  videoProducers?: Map<string, mediasoupTypes.Producer>; // userId -> Video Producer
  videoConsumers?: Map<string, Map<string, mediasoupTypes.Consumer>>; // userId -> (consumerId -> Consumer)
}

const workers: mediasoupTypes.Worker[] = [];
const channelRouters = new Map<string, VoiceChannelRouter>();

let workerIndex = 0;

// ─── MediaSoup Configuration ────────────────────────────
const mediaCodecs: mediasoupTypes.RtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
    preferredPayloadType: 111,
  },
  {
    kind: "audio",
    mimeType: "audio/PCMU",
    clockRate: 8000,
    preferredPayloadType: 0,
  },
  {
    kind: "audio",
    mimeType: "audio/PCMA",
    clockRate: 8000,
    preferredPayloadType: 8,
  },
  // Video codecs for screen sharing
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    preferredPayloadType: 96,
  },
  {
    kind: "video",
    mimeType: "video/VP9",
    clockRate: 90000,
    preferredPayloadType: 97,
  },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    preferredPayloadType: 98,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "42e01f",
      "level-asymmetry-allowed": 1,
    },
  },
];

// ─── Initialize Workers ─────────────────────────────────
export async function initializeMediasoupWorkers(): Promise<void> {
  const numWorkers = Math.min(4, require("os").cpus().length);

  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: "warn",
      logTags: ["rtp", "srtp", "rtcp"],
      rtcMinPort: 40000,
      rtcMaxPort: 40100, // 101 ports for local dev; expose this range in docker-compose
    });

    worker.on("died", () => {
      console.error(`[mediasoup] Worker ${i} died, restarting...`);
      setTimeout(() => initializeMediasoupWorkers(), 2000);
    });

    workers.push(worker);
  }

  console.log(`[mediasoup] ${numWorkers} workers created`);
}

// ─── Get or Create Router for a Voice Channel ───────────
function getNextWorker(): mediasoupTypes.Worker {
  const worker = workers[workerIndex % workers.length];
  workerIndex++;
  return worker;
}

export async function getOrCreateRouter(
  channelId: string
): Promise<VoiceChannelRouter> {
  let channelRouter = channelRouters.get(channelId);

  if (!channelRouter) {
    const worker = getNextWorker();
    const router = await worker.createRouter({ mediaCodecs });

    channelRouter = {
      router,
      producers: new Map(),
      consumers: new Map(),
    };

    channelRouters.set(channelId, channelRouter);
  }

  return channelRouter;
}

// ─── Create WebRTC Transport ────────────────────────────
export async function createWebRtcTransport(
  channelId: string
): Promise<mediasoupTypes.WebRtcTransport> {
  const channelRouter = await getOrCreateRouter(channelId);
  const router = channelRouter.router;

  const transport = await router.createWebRtcTransport({
    listenIps: [
      {
        ip: "0.0.0.0",
        announcedIp: env.ANNOUNCED_IP,
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1_000_000,
  });

  return transport;
}

// ─── Connect Transport ─────────────────────────────────
export async function connectTransport(
  transport: mediasoupTypes.WebRtcTransport,
  dtlsParameters: mediasoupTypes.DtlsParameters
): Promise<void> {
  await transport.connect({ dtlsParameters });
}

// ─── Produce Audio ─────────────────────────────────────
export async function produceAudio(
  transport: mediasoupTypes.WebRtcTransport,
  channelId: string,
  userId: string,
  rtpParameters: mediasoupTypes.RtpParameters
): Promise<mediasoupTypes.Producer> {
  const channelRouter = channelRouters.get(channelId);
  if (!channelRouter) throw new Error("Channel router not found");

  // Close existing producer for this user if any
  const existingProducer = channelRouter.producers.get(userId);
  if (existingProducer) {
    existingProducer.close();
  }

  const producer = await transport.produce({
    kind: "audio",
    rtpParameters,
  });

  channelRouter.producers.set(userId, producer);

  producer.on("transportclose", () => {
    producer.close();
    channelRouter.producers.delete(userId);
  });

  return producer;
}

// ─── Consume Audio ─────────────────────────────────────
export async function consumeAudio(
  transport: mediasoupTypes.WebRtcTransport,
  channelId: string,
  userId: string,
  producerId: string,
  rtpCapabilities: mediasoupTypes.RtpCapabilities
): Promise<mediasoupTypes.Consumer | null> {
  const channelRouter = channelRouters.get(channelId);
  if (!channelRouter) throw new Error("Channel router not found");

  const router = channelRouter.router;

  if (!router.canConsume({ producerId, rtpCapabilities })) {
    console.warn(`[mediasoup] Cannot consume producer ${producerId}`);
    return null;
  }

  const consumer = await transport.consume({
    producerId,
    rtpCapabilities,
    paused: false,
  });

  // Store consumer reference
  if (!channelRouter.consumers.has(userId)) {
    channelRouter.consumers.set(userId, new Map());
  }
  channelRouter.consumers.get(userId)!.set(consumer.id, consumer);

  consumer.on("transportclose", () => {
    consumer.close();
    channelRouter.consumers.get(userId)?.delete(consumer.id);
  });

  consumer.on("producerclose", () => {
    consumer.close();
    channelRouter.consumers.get(userId)?.delete(consumer.id);
  });

  return consumer;
}

// ─── Produce Video (Screen Share) ──────────────────────
export async function produceVideo(
  transport: mediasoupTypes.WebRtcTransport,
  channelId: string,
  userId: string,
  rtpParameters: mediasoupTypes.RtpParameters
): Promise<mediasoupTypes.Producer> {
  const channelRouter = channelRouters.get(channelId);
  if (!channelRouter) throw new Error("Channel router not found");

  // Close existing video producer for this user if any
  const existingVideoProducer = channelRouter.videoProducers?.get(userId);
  if (existingVideoProducer) {
    existingVideoProducer.close();
  }

  const producer = await transport.produce({
    kind: "video",
    rtpParameters,
  });

  // Ensure videoProducers map exists
  if (!channelRouter.videoProducers) {
    (channelRouter as any).videoProducers = new Map();
  }
  channelRouter.videoProducers!.set(userId, producer);

  producer.on("transportclose", () => {
    producer.close();
    channelRouter.videoProducers?.delete(userId);
  });

  return producer;
}

// ─── Consume Video (Screen Share) ──────────────────────
export async function consumeVideo(
  transport: mediasoupTypes.WebRtcTransport,
  channelId: string,
  userId: string,
  producerId: string,
  rtpCapabilities: mediasoupTypes.RtpCapabilities
): Promise<mediasoupTypes.Consumer | null> {
  const channelRouter = channelRouters.get(channelId);
  if (!channelRouter) throw new Error("Channel router not found");

  const router = channelRouter.router;

  if (!router.canConsume({ producerId, rtpCapabilities })) {
    console.warn(`[mediasoup] Cannot consume video producer ${producerId}`);
    return null;
  }

  const consumer = await transport.consume({
    producerId,
    rtpCapabilities,
    paused: false,
  });

  // Store video consumer reference
  if (!channelRouter.videoConsumers) {
    (channelRouter as any).videoConsumers = new Map();
  }
  if (!channelRouter.videoConsumers!.has(userId)) {
    channelRouter.videoConsumers!.set(userId, new Map());
  }
  channelRouter.videoConsumers!.get(userId)!.set(consumer.id, consumer);

  consumer.on("transportclose", () => {
    consumer.close();
    channelRouter.videoConsumers?.get(userId)?.delete(consumer.id);
  });

  consumer.on("producerclose", () => {
    consumer.close();
    channelRouter.videoConsumers?.get(userId)?.delete(consumer.id);
  });

  return consumer;
}

// ─── Stop Screen Share ─────────────────────────────────
export function stopScreenShare(channelId: string, userId: string): void {
  const channelRouter = channelRouters.get(channelId);
  if (!channelRouter) return;

  const videoProducer = channelRouter.videoProducers?.get(userId);
  if (videoProducer) {
    videoProducer.close();
    channelRouter.videoProducers?.delete(userId);
  }
}

// ─── Get Active Video Producers ────────────────────────
export function getActiveVideoProducers(channelId: string): mediasoupTypes.Producer[] {
  const channelRouter = channelRouters.get(channelId);
  if (!channelRouter) return [];
  return Array.from(channelRouter.videoProducers?.values() || []);
}

// ─── Remove User from Channel ──────────────────────────
export function removeUserFromChannel(channelId: string, userId: string): void {
  const channelRouter = channelRouters.get(channelId);
  if (!channelRouter) return;

  // Clean up audio producer
  const producer = channelRouter.producers.get(userId);
  if (producer) {
    producer.close();
    channelRouter.producers.delete(userId);
  }

  // Clean up audio consumers
  const userConsumers = channelRouter.consumers.get(userId);
  if (userConsumers) {
    userConsumers.forEach((consumer) => consumer.close());
    channelRouter.consumers.delete(userId);
  }

  // Clean up video producer (screen share)
  const videoProducer = channelRouter.videoProducers?.get(userId);
  if (videoProducer) {
    videoProducer.close();
    channelRouter.videoProducers?.delete(userId);
  }

  // Clean up video consumers
  const userVideoConsumers = channelRouter.videoConsumers?.get(userId);
  if (userVideoConsumers) {
    userVideoConsumers.forEach((consumer) => consumer.close());
    channelRouter.videoConsumers?.delete(userId);
  }
}

// ─── Get Active Producers in Channel ───────────────────
export function getActiveProducers(channelId: string): mediasoupTypes.Producer[] {
  const channelRouter = channelRouters.get(channelId);
  if (!channelRouter) return [];
  return Array.from(channelRouter.producers.values());
}
