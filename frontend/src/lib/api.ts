const API_BASE = import.meta.env.VITE_API_URL || "";

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem("token");
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem("token", token);
    } else {
      localStorage.removeItem("token");
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any,
    options?: RequestInit
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...(options?.headers as Record<string, string>),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    // Don't set Content-Type for FormData (file uploads)
    if (!(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Request failed" }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // ─── Auth ────────────────────────────────────────────
  async getAuthProviders() {
    return this.request<{ providers: { github: boolean } }>("GET", "/api/auth/providers");
  }


  async register(data: { email: string; password: string; displayName: string }) {
    return this.request<{ user: any; token: string }>("POST", "/api/auth/register", data);
  }

  async login(data: { email: string; password: string }) {
    return this.request<{ user: any; token: string }>("POST", "/api/auth/login", data);
  }

  async getMe() {
    return this.request<{ user: any }>("GET", "/api/auth/me");
  }

  // ─── Rooms ───────────────────────────────────────────
  async getRooms() {
    return this.request<{ rooms: any[] }>("GET", "/api/rooms");
  }

  async getRoom(id: string) {
    return this.request<{ room: any }>("GET", `/api/rooms/${id}`);
  }

  async createRoom(data: { name: string; description?: string; isPublic?: boolean }) {
    return this.request<{ room: any }>("POST", "/api/rooms", data);
  }

  async updateRoom(id: string, data: any) {
    return this.request<{ room: any }>("PUT", `/api/rooms/${id}`, data);
  }

  async joinRoom(id: string) {
    return this.request<{ room: any }>("POST", `/api/rooms/${id}/join`);
  }

  async deleteRoom(id: string) {
    return this.request<{ message: string }>("DELETE", `/api/rooms/${id}`);
  }

  // ─── Notes ───────────────────────────────────────────
  async getNotes(roomId: string) {
    return this.request<{ notes: any[] }>("GET", `/api/notes/${roomId}`);
  }

  async getNote(roomId: string, noteId: string) {
    return this.request<{ note: any }>("GET", `/api/notes/${roomId}/${noteId}`);
  }

  async createNote(roomId: string, data: { title: string; content: string; isPrivate?: boolean }) {
    return this.request<{ note: any }>("POST", `/api/notes/${roomId}`, data);
  }

  async updateNote(roomId: string, noteId: string, data: any) {
    return this.request<{ note: any }>("PUT", `/api/notes/${roomId}/${noteId}`, data);
  }

  async deleteNote(roomId: string, noteId: string) {
    return this.request<{ message: string }>("DELETE", `/api/notes/${roomId}/${noteId}`);
  }

  // ─── Messages ────────────────────────────────────────
  async getMessages(roomId: string, cursor?: string, limit?: number) {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (limit) params.set("limit", String(limit));
    return this.request<{ messages: any[]; nextCursor: string | null }>(
      "GET",
      `/api/messages/${roomId}?${params}`
    );
  }

  async getThread(roomId: string, messageId: string) {
    return this.request<{ replies: any[] }>(
      "GET",
      `/api/messages/${roomId}/${messageId}/thread`
    );
  }

  async sendMessage(roomId: string, data: { content: string; parentId?: string }) {
    return this.request<{ message: any }>("POST", `/api/messages/${roomId}`, data);
  }

  async deleteMessage(roomId: string, messageId: string) {
    return this.request<{ message: string }>(
      "DELETE",
      `/api/messages/${roomId}/${messageId}`
    );
  }

  // ─── Files ───────────────────────────────────────────
  async uploadFile(roomId: string, file: File, caption?: string) {
    const formData = new FormData();
    formData.append("file", file);
    if (caption) formData.append("caption", caption);
    return this.request<{ message: any }>("POST", `/api/files/${roomId}/upload`, formData);
  }

  async uploadAudio(roomId: string, blob: Blob, caption?: string) {
    console.log(`[API] uploadAudio: roomId='${roomId}' blobType='${blob.type}' blobSize=${blob.size}`);
    const formData = new FormData();
    formData.append("audio", blob, "voice-message.webm");
    if (caption) formData.append("caption", caption);
    try {
      const result = await this.request<{ message: any }>("POST", `/api/files/${roomId}/audio`, formData);
      console.log(`[API] ✅ uploadAudio success: messageId='${result.message?.id}'`);
      return result;
    } catch (err) {
      console.error(`[API] ❌ uploadAudio failed:`, err);
      throw err;
    }
  }

  async getFileDownloadUrl(roomId: string, fileId: string) {
    return this.request<{ url: string; filename: string; mimeType: string }>(
      "GET",
      `/api/files/${roomId}/${fileId}/download`
    );
  }

  async getFileBlob(roomId: string, fileId: string): Promise<Blob> {
    console.log(`[API] getFileBlob: roomId='${roomId}' fileId='${fileId}'`);
    const headers: Record<string, string> = {};
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    const response = await fetch(`${API_BASE}/api/files/${roomId}/${fileId}/download`, {
      headers,
    });
    if (!response.ok) {
      console.error(`[API] ❌ getFileBlob: HTTP ${response.status}`);
      throw new Error(`Failed to fetch file: ${response.status}`);
    }
    const blob = await response.blob();
    console.log(`[API] ✅ getFileBlob: type='${blob.type}' size=${blob.size} bytes`);
    return blob;
  }

  async deleteFile(roomId: string, fileId: string) {
    return this.request<{ message: string }>(
      "DELETE",
      `/api/files/${roomId}/${fileId}`
    );
  }

  // ─── Search ──────────────────────────────────────────
  async searchMessages(query: string, roomId?: string) {
    const params = new URLSearchParams();
    params.set("q", query);
    if (roomId) params.set("roomId", roomId);
    return this.request<{ messages: any[] }>(
      "GET",
      `/api/messages/search?${params}`
    );
  }

  // ─── Reactions ──────────────────────────────────────
  async toggleReaction(roomId: string, messageId: string, emoji: string) {
    return this.request<{ action: string; reaction?: any; emoji?: string }>(
      "POST",
      `/api/messages/${roomId}/${messageId}/reactions`,
      { emoji }
    );
  }

  async getReactions(roomId: string, messageId: string) {
    return this.request<{ reactions: any[] }>(
      "GET",
      `/api/messages/${roomId}/${messageId}/reactions`
    );
  }

  // ─── Users ───────────────────────────────────────────
  async searchUsers(query: string) {
    return this.request<{ users: any[] }>("GET", `/api/users/search?q=${encodeURIComponent(query)}`);
  }

  // ─── Room Members ────────────────────────────────────
  async addMember(roomId: string, userId: string) {
    return this.request<{ room: any }>("POST", `/api/rooms/${roomId}/members`, { userId });
  }

  async removeMember(roomId: string, userId: string) {
    return this.request<{ room: any }>("DELETE", `/api/rooms/${roomId}/members/${userId}`);
  }

  // ─── Voice Channels ──────────────────────────────────
  async getVoiceChannels(roomId: string) {
    return this.request<{ channels: any[] }>("GET", `/api/voice/${roomId}`);
  }

  async createVoiceChannel(roomId: string, name: string) {
    return this.request<{ channel: any }>("POST", `/api/voice/${roomId}`, { name });
  }

  async deleteVoiceChannel(roomId: string, channelId: string) {
    return this.request<{ message: string }>(
      "DELETE",
      `/api/voice/${roomId}/${channelId}`
    );
  }
}

export const api = new ApiClient();
