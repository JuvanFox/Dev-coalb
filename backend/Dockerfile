# ─── Build Stage ─────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies for mediasoup (native worker)
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
    python3 make g++ pkg-config 2>&1 | tail -3 && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY prisma/ ./prisma/
RUN npx prisma generate

COPY src/ ./src/
RUN npm run build

# ─── Production Stage ────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install runtime deps: OpenSSL (Prisma) + mediasoup runtime libs
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
    openssl ca-certificates \
    libssl-dev libuv1 2>&1 | tail -3 && rm -rf /var/lib/apt/lists/*

# Copy everything from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000

CMD ["node", "dist/index.js"]
