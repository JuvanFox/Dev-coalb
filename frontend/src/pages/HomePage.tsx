import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useRoomStore } from "@/store/room";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ScrollArea
} from "@/components/ui/scroll-area";
import {
  Plus,
  Hash,
  Globe,
  Lock,
  Users,
  MessageSquare,
  FileText,
} from "lucide-react";
import { getInitials, formatDate } from "@/lib/utils";

export function HomePage() {
  const navigate = useNavigate();
  const { rooms, createRoom, fetchRooms, isLoading } = useRoomStore();
  const { user } = useAuthStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDesc, setNewRoomDesc] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Fetch rooms on mount
  useEffect(() => {
    fetchRooms();
  }, []);

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;
    setIsCreating(true);
    try {
      const room = await createRoom({
        name: newRoomName.trim(),
        description: newRoomDesc.trim() || undefined,
        isPublic,
      });
      setIsCreateOpen(false);
      setNewRoomName("");
      setNewRoomDesc("");
      navigate(`/room/${room.id}`);
    } catch (err) {
      console.error("Failed to create room:", err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="h-12 flex items-center px-6 border-b border-border">
        <h1 className="text-lg font-semibold">Home</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Welcome, {user?.displayName}
          </span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 max-w-4xl mx-auto space-y-8">
          {/* Welcome */}
          <div>
            <h2 className="text-2xl font-bold mb-2">DevCollab</h2>
            <p className="text-muted-foreground">
              Developer collaboration hub — create rooms, share notes, chat, and collaborate in real-time.
            </p>
          </div>

          {/* Rooms */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Rooms</h3>
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    Create Room
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create a Room</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-muted-foreground">Room Name</label>
                      <Input
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        placeholder="e.g., project-alpha"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Description</label>
                      <Input
                        value={newRoomDesc}
                        onChange={(e) => setNewRoomDesc(e.target.value)}
                        placeholder="What's this room about?"
                        className="mt-1"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isPublic}
                          onChange={(e) => setIsPublic(e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm">Public room</span>
                      </label>
                    </div>
                    <Button
                      onClick={handleCreateRoom}
                      disabled={!newRoomName.trim() || isCreating}
                      className="w-full"
                    >
                      {isCreating ? "Creating..." : "Create Room"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-sidebar-hover rounded-lg animate-pulse" />
                ))}
              </div>
            ) : rooms.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Hash className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No rooms yet. Create one to get started!</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {rooms.map((room) => {
                  const isMember = room.members?.some(
                    (m: any) => m.userId === user?.id
                  );
                  return (
                    <button
                      key={room.id}
                      onClick={() =>
                        isMember
                          ? navigate(`/room/${room.id}`)
                          : navigate(`/room/${room.id}`)
                      }
                      className="flex items-start gap-4 p-4 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                        <Hash className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold truncate">{room.name}</h4>
                          {room.isPublic ? (
                            <Globe className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                          )}
                        </div>
                        {room.description && (
                          <p className="text-sm text-muted-foreground truncate mt-0.5">
                            {room.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {room.members?.length || 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {room._count?.messages || 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            {room._count?.notes || 0}
                          </span>
                        </div>
                      </div>
                      {isMember && (
                        <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
                          Member
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
