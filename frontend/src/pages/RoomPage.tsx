import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import { useRoomStore } from "@/store/room";
import { api } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChatView } from "@/components/chat/ChatView";
import { NotesView } from "@/components/notes/NotesView";
import { FilesView } from "@/components/files/FilesView";
import { VoiceChannelView } from "@/components/voice/VoiceChannelView";
import { getInitials } from "@/lib/utils";
import { Users, Plus, X, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface RoomContext {
  room: any;
  activeView: "chat" | "notes" | "files";
  setActiveView: (view: "chat" | "notes" | "files") => void;
  activeVoiceChannel: any;
  onVoiceChannelLeave: () => void;
}

export function RoomPage() {
  const { room, activeView, activeVoiceChannel, onVoiceChannelLeave } = useOutletContext<RoomContext>();
  const { user } = useAuthStore();
  const { fetchRoom } = useRoomStore();

  const [membersOpen, setMembersOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<any>(null);

  if (!room) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Loading room...</p>
      </div>
    );
  }

  const currentMember = room.members?.find((m: any) => m.userId === user?.id);
  const isAdmin = currentMember?.role === "admin";

  // ─── Search users for invite ─────────────────────────
  const handleUserSearch = (query: string) => {
    setUserSearchQuery(query);
    if (searchTimeout) clearTimeout(searchTimeout);

    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.searchUsers(query);
        // Filter out existing members
        const memberIds = new Set(room.members?.map((m: any) => m.userId) || []);
        setSearchResults((res.users || []).filter((u: any) => !memberIds.has(u.id)));
      } catch (err) {
        console.error("User search error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    setSearchTimeout(timeout);
  };

  // ─── Invite user ──────────────────────────────────────
  const handleInvite = async (targetUserId: string) => {
    try {
      const res = await api.addMember(room.id, targetUserId);
      fetchRoom(room.id); // Refresh room data
      setUserSearchQuery("");
      setSearchResults([]);
      setInviteOpen(false);
    } catch (err) {
      console.error("Failed to invite user:", err);
    }
  };

  // ─── Remove member ────────────────────────────────────
  const handleRemoveMember = async (targetUserId: string) => {
    if (!confirm("Remove this member from the room?")) return;
    try {
      await api.removeMember(room.id, targetUserId);
      fetchRoom(room.id);
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="h-12 flex items-center px-4 border-b border-border shrink-0 bg-background">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="font-semibold text-sm">{room.name}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Non-member: show Join button */}
          {!currentMember && room.isPublic && (
            <button
              onClick={async () => {
                try {
                  await api.joinRoom(room.id);
                  fetchRoom(room.id);
                } catch (err) {
                  console.error("Failed to join room:", err);
                }
              }}
              className="flex items-center gap-1.5 text-xs bg-primary text-white px-3 py-1.5 rounded hover:bg-primary/90 transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              Join Room
            </button>
          )}

          {/* Member: show member count & invite */}
          {currentMember && (
          <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
            <DialogTrigger asChild>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-sidebar-hover transition-colors">
                <Users className="w-3.5 h-3.5" />
                <span>{room.members?.length || 0}</span>
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Members — {room.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {room.members?.map((member: any) => (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-sidebar-hover"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={member.user.avatarUrl || undefined} />
                        <AvatarFallback className="text-xs">
                          {getInitials(member.user.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{member.user.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.role === "admin" ? "Admin" : "Member"}
                        </p>
                      </div>
                    </div>
                    {isAdmin && member.userId !== user?.id && (
                      <button
                        onClick={() => handleRemoveMember(member.userId)}
                        className="text-muted-foreground hover:text-destructive p-1"
                        title="Remove member"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Invite button (admin only) */}
              {isAdmin && (
                <div className="pt-3 border-t border-border mt-3">
                  <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                    <DialogTrigger asChild>
                      <button className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors">
                        <Plus className="w-4 h-4" />
                        Invite People
                      </button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Invite to {room.name}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        {/* Search */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input
                            type="text"
                            value={userSearchQuery}
                            onChange={(e) => handleUserSearch(e.target.value)}
                            placeholder="Search by name or email..."
                            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg bg-sidebar-active border border-border focus:border-primary/50 focus:outline-none text-foreground placeholder:text-muted-foreground"
                            autoFocus
                          />
                        </div>

                        {/* Results */}
                        <div className="max-h-60 overflow-y-auto space-y-1">
                          {isSearching && (
                            <div className="flex justify-center py-4">
                              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                          {!isSearching && searchResults.length === 0 && userSearchQuery.trim() && (
                            <p className="text-center text-sm text-muted-foreground py-4">No users found</p>
                          )}
                          {searchResults.map((u: any) => (
                            <div
                              key={u.id}
                              className="flex items-center justify-between p-2 rounded-lg hover:bg-sidebar-hover"
                            >
                              <div className="flex items-center gap-3">
                                <Avatar className="w-8 h-8">
                                  <AvatarImage src={u.avatarUrl || undefined} />
                                  <AvatarFallback className="text-xs">
                                    {getInitials(u.displayName)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-sm font-medium">{u.displayName}</p>
                                  <p className="text-xs text-muted-foreground">{u.email}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleInvite(u.id)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-primary text-white hover:bg-primary/90 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                Invite
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
            </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Voice channel indicator (if active) */}
        {activeVoiceChannel && (
          <div className="shrink-0 px-4 pt-2">
            <VoiceChannelView
              channelId={activeVoiceChannel.id}
              roomId={room.id}
              channelName={activeVoiceChannel.name}
              onLeave={onVoiceChannelLeave}
            />
          </div>
        )}

        {/* Main view */}
        <div className="flex-1 min-h-0">
          {activeView === "chat" && <ChatView room={room} />}
          {activeView === "notes" && <NotesView room={room} />}
          {activeView === "files" && <FilesView room={room} />}
        </div>
      </div>
    </div>
  );
}
