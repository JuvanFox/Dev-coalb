# DevCollab — Developer Collaboration Hub

A Discord-style collaboration platform built for developer teams. Features real-time messaging, voice channels, file sharing, collaborative notes, and audio messages — all self-hosted with Docker.

![Tech Stack](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![Tech Stack](https://img.shields.io/badge/Node.js-20-339933?logo=node.js)
![Tech Stack](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Tech Stack](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)
![Tech Stack](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)

---

## ✨ Features

### 💬 Real-time Chat
- Instant messaging powered by **Socket.IO** with typing indicators
- Thread replies and emoji reactions
- Message search across all rooms
- Rich text content

### 🎤 Voice Channels
- Real-time voice communication using **Mediasoup SFU** (WebRTC)
- Low-latency, scalable SFU architecture
- Voice activity detection
- Speaker indicators

### 🎵 Audio Messages
- Record and send voice messages directly in chat
- Browser-based audio recording (WebRTC)
- WebM Opus encoding for efficient playback

### 📁 File Sharing
- Upload and share any file type via **MinIO** (S3-compatible object storage)
- Automatic file previews for images, PDFs, and audio
- Drag-and-drop upload support
- Per-room file organization

### 📝 Collaborative Notes
- Write and share notes within rooms
- Public and private visibility controls
- Rich text note support

### 🔐 Authentication
- Email/password registration with **JWT** tokens
- **GitHub OAuth** login (optional)
- Role-based access (user / admin / superadmin)
- Room-level member roles

### 🏠 Rooms
- Create public or private rooms
- Room admin controls for member management
- Project-specific collaboration spaces

---

## 🖥️ Screenshots

*(Add screenshots here)*

| Chat View | Voice Channel | File Browser |
|-----------|--------------|--------------|
|           |              |              |

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Zustand |
| **Backend** | Node.js, Express, TypeScript, Socket.IO, Prisma ORM |
| **Database** | PostgreSQL 16 (Alpine) |
| **Cache** | Redis 7 (Alpine) |
| **File Storage** | MinIO (S3-compatible object storage) |
| **Voice Engine** | Mediasoup SFU (WebRTC) |
| **Auth** | JWT + Passport (local strategy + GitHub OAuth) |
| **Container** | Docker Compose + multi-stage Docker builds |

---

## 🚀 Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/engine/install/) & [Docker Compose](https://docs.docker.com/compose/install/)

### Option A — Deploy from Zip (no Git)

```bash
# 1. Unzip the project on the target machine
unzip devcollab.zip
cd devcollab

# 2. Copy environment and update the IP
cp .env.example .env
# Edit .env — change FRONTEND_URL and ANNOUNCED_IP to the new machine's IP

# 3. Generate SSL certificates
mkdir -p certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/devcollab.key \
  -out certs/devcollab.crt \
  -subj "/CN=<NEW_MACHINE_IP>" \
  -addext "subjectAltName=DNS:localhost,IP:<NEW_MACHINE_IP>"

# 4. Start all services
docker compose up -d --build

# 5. Run database setup
docker compose exec backend npx prisma db push

# 6. Access the app at https://<NEW_MACHINE_IP>:3000
```

### Option B — Clone from GitHub

```bash
git clone <your-repo-url> devcollab
cd devcollab

# Copy environment file (edit if needed)
cp .env.example .env
```

### 2. Generate SSL Certificates (for HTTPS)

```bash
mkdir -p certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/devcollab.key \
  -out certs/devcollab.crt \
  -subj "/CN=192.168.10.122" \
  -addext "subjectAltName=DNS:localhost,IP:192.168.10.122"
```

> Replace `192.168.10.122` with your server's LAN IP address.

### 3. Start All Services

```bash
docker compose up -d --build
```

### 4. Run Database Migrations

```bash
docker compose exec backend npx prisma db push
```

> Optionally seed the database:
> ```bash
> docker compose exec backend npx prisma db seed
> ```

### 5. Access the App

Open **`https://<YOUR_SERVER_IP>:3000`** in your browser.

> Accept the self-signed certificate warning (it's your local cert).

---

## 🛠️ Configuration

All configuration is managed through the `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_USER` | `devcollab` | PostgreSQL user |
| `DB_PASSWORD` | `devcollab_secret` | PostgreSQL password |
| `JWT_SECRET` | *(required)* | Secret for signing JWT tokens. Generate with `openssl rand -base64 48` |
| `FRONTEND_URL` | `https://192.168.10.122:3000` | Frontend URL for CORS |
| `ANNOUNCED_IP` | `192.168.10.122` | Public IP for WebRTC ICE candidates |
| `GITHUB_CLIENT_ID` | *(optional)* | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | *(optional)* | GitHub OAuth App client secret |

---

## 📂 Project Structure

```
devcollab/
├── docker-compose.yml          # Orchestrates all services
├── .env                        # Environment variables (git-ignored)
├── .env.example                # Template for .env
├── .gitignore
├── README.md
├── certs/                      # SSL certificates (git-ignored)
│   ├── devcollab.crt
│   └── devcollab.key
├── backend/
│   ├── Dockerfile              # Multi-stage Node.js build
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   └── schema.prisma       # Database schema
│   └── src/
│       ├── index.ts            # Express server entry
│       ├── config/env.ts       # Zod-validated environment
│       ├── middleware/
│       │   ├── auth.ts         # JWT authentication
│       │   └── upload.ts       # File upload handling
│       ├── routes/
│       │   ├── auth.ts         # /api/auth/*
│       │   ├── rooms.ts        # /api/rooms/*
│       │   ├── messages.ts     # /api/messages/*
│       │   ├── files.ts        # /api/files/*
│       │   ├── notes.ts        # /api/notes/*
│       │   ├── users.ts        # /api/users/*
│       │   └── voice.ts        # /api/voice/*
│       ├── services/
│       │   └── s3.ts           # MinIO/S3 client
│       ├── sockets/
│       │   ├── index.ts        # Socket.IO server setup
│       │   ├── chat.ts         # Chat event handlers
│       │   └── presence.ts     # Presence & typing indicators
│       └── webrtc/
│           ├── mediasoup.ts    # Mediasoup router & transports
│           └── signaling.ts    # WebRTC signaling handlers
└── frontend/
    ├── Dockerfile              # Multi-stage React + nginx build
    ├── nginx.conf              # nginx config (HTTP → HTTPS redirect)
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    ├── tsconfig.json
    └── src/
        ├── main.tsx
        ├── App.tsx             # Router & auth guard
        ├── lib/
        │   ├── api.ts          # Axios API client
        │   ├── socket.ts       # Socket.IO client
        │   └── utils.ts        # Utility functions
        ├── components/
        │   ├── ui/             # shadcn/ui components
        │   ├── layout/         # AppShell, Sidebar, ChannelBar
        │   ├── chat/           # ChatView, MessageBubble, AudioRecorder
        │   ├── notes/          # NotesView
        │   └── files/          # FilesView
        └── pages/
            ├── LoginPage.tsx
            ├── RegisterPage.tsx
            ├── HomePage.tsx
            └── RoomPage.tsx
```

---

## 📡 API Overview

All API routes are prefixed with `/api`. Authentication is via `Authorization: Bearer <JWT>` header.

### Auth
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/providers` | List enabled auth providers |
| POST | `/api/auth/register` | Register with email/password |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Get current user profile |
| GET | `/api/auth/github` | GitHub OAuth login |

### Rooms
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/rooms` | List all rooms |
| POST | `/api/rooms` | Create a room |
| GET | `/api/rooms/:id` | Get room details |
| POST | `/api/rooms/:id/join` | Join a room |

### Messages
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/messages/:roomId` | Get messages (paginated) |
| POST | `/api/messages/:roomId` | Send a message |
| GET | `/api/messages/search?q=` | Search messages |
| DELETE | `/api/messages/:roomId/:msgId` | Delete a message |
| POST | `/api/messages/:roomId/:msgId/reactions` | Toggle reaction |

### Files
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/files/:roomId/upload` | Upload a file |
| POST | `/api/files/:roomId/audio` | Upload audio recording |
| GET | `/api/files/:roomId/:fileId/download` | Download a file |

### Notes
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notes/:roomId` | List notes in room |
| POST | `/api/notes/:roomId` | Create a note |

### Voice
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/voice/:roomId` | List voice channels |
| POST | `/api/voice/:roomId` | Create a voice channel |

---

## 🔧 Local Development

```bash
# Start infrastructure services (DB, Redis, MinIO)
docker compose up -d postgres redis minio

# Backend (terminal 2)
cd backend
cp ../.env.example .env
npm install
npx prisma generate
npx prisma db push
npm run dev

# Frontend (terminal 3)
cd frontend
cp ../.env.example .env
npm install
npm run dev
```

---

## 📜 License

MIT

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
