import { create } from "zustand";
import { api } from "../lib/api";

interface Room {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  createdById: string;
  members: any[];
  voiceChannels?: any[];
  _count: { messages: number; notes: number; files: number };
  createdAt: string;
}

interface RoomState {
  rooms: Room[];
  currentRoom: Room | null;
  isLoading: boolean;

  fetchRooms: () => Promise<void>;
  fetchRoom: (id: string) => Promise<void>;
  createRoom: (data: { name: string; description?: string; isPublic?: boolean }) => Promise<Room>;
  updateRoom: (id: string, data: any) => Promise<void>;
  joinRoom: (id: string) => Promise<void>;
  deleteRoom: (id: string) => Promise<void>;
  setCurrentRoom: (room: Room | null) => void;
}

export const useRoomStore = create<RoomState>((set, get) => ({
  rooms: [],
  currentRoom: null,
  isLoading: false,

  fetchRooms: async () => {
    set({ isLoading: true });
    try {
      const res = await api.getRooms();
      set({ rooms: res.rooms, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  fetchRoom: async (id) => {
    set({ isLoading: true });
    try {
      const res = await api.getRoom(id);
      set({ currentRoom: res.room, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  createRoom: async (data) => {
    const res = await api.createRoom(data);
    set((state) => ({ rooms: [res.room, ...state.rooms] }));
    return res.room;
  },

  updateRoom: async (id, data) => {
    const res = await api.updateRoom(id, data);
    set((state) => ({
      rooms: state.rooms.map((r) => (r.id === id ? res.room : r)),
      currentRoom: state.currentRoom?.id === id ? res.room : state.currentRoom,
    }));
  },

  joinRoom: async (id) => {
    await api.joinRoom(id);
    await get().fetchRooms();
  },

  deleteRoom: async (id) => {
    await api.deleteRoom(id);
    set((state) => ({
      rooms: state.rooms.filter((r) => r.id !== id),
      currentRoom: state.currentRoom?.id === id ? null : state.currentRoom,
    }));
  },

  setCurrentRoom: (room) => set({ currentRoom: room }),
}));
