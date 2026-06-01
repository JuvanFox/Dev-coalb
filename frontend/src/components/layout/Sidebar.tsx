import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import { useRoomStore } from "@/store/room";
import { cn, getInitials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Plus,
  LogOut,
  Hash,
  Home,
  Settings,
} from "lucide-react";

export function Sidebar() {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const { user, logout } = useAuthStore();
  const { rooms, fetchRooms, createRoom } = useRoomStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDesc, setNewRoomDesc] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

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

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex flex-col h-full w-[72px] bg-sidebar items-center py-3 gap-2 shrink-0">
      {/* Home button */}
      <button
        onClick={() => navigate("/")}
        className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200",
          !roomId
            ? "bg-primary rounded-2xl"
            : "bg-sidebar-hover hover:bg-primary hover:rounded-2xl rounded-3xl"
        )}
        title="Home"
      >
        <Home className="w-5 h-5 text-white" />
      </button>

      {/* Separator */}
      <div className="w-8 h-[2px] bg-sidebar-active rounded-full" />

      {/* Room list */}
      <div className="flex-1 flex flex-col gap-2 overflow-y-auto px-2 scrollbar-none">
        {rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => navigate(`/room/${room.id}`)}
            className={cn(
              "w-12 h-12 rounded-3xl flex items-center justify-center transition-all duration-200 relative group",
              roomId === room.id
                ? "bg-primary rounded-2xl"
                : "bg-sidebar-hover hover:bg-primary hover:rounded-2xl"
            )}
            title={room.name}
          >
            <span className="text-white font-semibold text-sm">
              {getInitials(room.name)}
            </span>
            {/* Active indicator */}
            {roomId === room.id && (
              <div className="absolute -left-3 w-1 h-8 bg-white rounded-r-full" />
            )}
          </button>
        ))}
      </div>

      {/* Create room */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogTrigger asChild>
          <button
            className="w-12 h-12 rounded-3xl bg-sidebar-hover hover:bg-green-600 hover:rounded-2xl flex items-center justify-center transition-all duration-200"
            title="Create Room"
          >
            <Plus className="w-6 h-6 text-green-500" />
          </button>
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
              <label className="text-sm text-muted-foreground">Description (optional)</label>
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

      {/* User avatar & logout */}
      <div className="mt-auto flex flex-col items-center gap-2">
        <button
          onClick={handleLogout}
          className="w-12 h-12 rounded-3xl bg-sidebar-hover hover:bg-destructive/80 hover:rounded-2xl flex items-center justify-center transition-all duration-200"
          title="Logout"
        >
          <LogOut className="w-5 h-5 text-muted-foreground" />
        </button>
        {user && (
          <Avatar className="w-10 h-10">
            <AvatarImage src={user.avatarUrl || undefined} />
            <AvatarFallback className="text-xs bg-primary">
              {getInitials(user.displayName)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}
