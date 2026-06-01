import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { useRoomStore } from "@/store/room";
import { getSocket } from "@/lib/socket";
import { Sidebar } from "./Sidebar";
import { ChannelBar } from "./ChannelBar";
import { Outlet, useParams, useNavigate } from "react-router-dom";

export function AppShell() {
  const { user } = useAuthStore();
  const { currentRoom, fetchRoom } = useRoomStore();
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<"chat" | "notes" | "files">("chat");
  const [activeVoiceChannel, setActiveVoiceChannel] = useState<any | null>(null);

  useEffect(() => {
    if (roomId) {
      fetchRoom(roomId).catch(() => navigate("/"));
    }
  }, [roomId]);

  useEffect(() => {
    if (roomId) {
      const socket = getSocket();
      socket.emit("room:join", roomId);
      socket.emit("presence:join", roomId);

      return () => {
        socket.emit("room:leave", roomId);
        socket.emit("presence:leave", roomId);
      };
    }
  }, [roomId]);

  // Leave voice channel when leaving room
  useEffect(() => {
    return () => {
      setActiveVoiceChannel(null);
    };
  }, [roomId]);

  const handleVoiceChannelJoin = (channel: any) => {
    setActiveVoiceChannel(channel);
    setActiveView("chat");
  };

  const handleVoiceChannelLeave = () => {
    setActiveVoiceChannel(null);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Server List / Room List */}
      <Sidebar />

      {/* Channel Bar (middle panel with channel list) */}
      {currentRoom && (
        <ChannelBar
          room={currentRoom}
          activeView={activeView}
          onViewChange={setActiveView}
          onVoiceChannelJoin={handleVoiceChannelJoin}
          activeVoiceChannelId={activeVoiceChannel?.id}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        <Outlet
          context={{
            room: currentRoom,
            activeView,
            setActiveView,
            activeVoiceChannel,
            onVoiceChannelLeave: handleVoiceChannelLeave,
          }}
        />
      </main>
    </div>
  );
}
