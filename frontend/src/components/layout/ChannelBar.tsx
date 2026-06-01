import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Hash,
  Mic,
  FileText,
  FolderOpen,
  Plus,
  ChevronDown,
  Volume2,
  Search,
  ArrowLeft,
  MessageSquare,
} from "lucide-react";
import { api } from "@/lib/api";


interface ChannelBarProps {
  room: any;
  activeView: "chat" | "notes" | "files";
  onViewChange: (view: "chat" | "notes" | "files") => void;
  onVoiceChannelJoin: (channel: any) => void;
  activeVoiceChannelId?: string | null;
}

export function ChannelBar({ room, activeView, onViewChange, onVoiceChannelJoin, activeVoiceChannelId }: ChannelBarProps) {
  const navigate = useNavigate();
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [voiceName, setVoiceName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<any>(null);

  const handleCreateVoice = async () => {
    if (!voiceName.trim()) return;
    try {
      await api.createVoiceChannel(room.id, voiceName.trim());
      setVoiceName("");
      setIsVoiceOpen(false);
    } catch (err) {
      console.error("Failed to create voice channel:", err);
    }
  };

  // ─── Search ──────────────────────────────────────────
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.searchMessages(query, room.id);
        setSearchResults(res.messages || []);
        setSearchOpen(true);
      } catch (err) {
        console.error("Search error:", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  const handleSearchResultClick = (message: any) => {
    setSearchOpen(false);
    setSearchQuery("");
    onViewChange("chat");
    // Navigate to the room if needed
    if (message.roomId !== room.id) {
      navigate(`/room/${message.roomId}`);
    }
    // Scroll to message would require more complex logic
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setSearchOpen(false);
      searchRef.current?.blur();
    }
  };

  return (
    <div className="w-60 bg-channel-bar flex flex-col h-full shrink-0 border-r border-border">
      {/* Room header */}
      <div className="h-12 flex items-center px-4 border-b border-border cursor-pointer hover:bg-sidebar-hover">
        <ChevronDown className="w-4 h-4 mr-2 text-muted-foreground" />
        <span className="font-semibold text-sm truncate">{room.name}</span>
      </div>

      {/* Search bar */}
      <div className="px-2 pt-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
            placeholder="Search messages..."
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded bg-sidebar-active border border-transparent focus:border-primary/50 focus:outline-none text-foreground placeholder:text-muted-foreground"
          />
          {isSearching && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Search results dropdown */}
        {searchOpen && searchResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-[calc(100%-1rem)] max-h-72 overflow-y-auto bg-popover border border-border rounded-lg shadow-xl">
            <div className="p-1">
              {searchResults.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => handleSearchResultClick(msg)}
                  className="w-full flex items-start gap-2 p-2 rounded text-left hover:bg-sidebar-hover transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">
                      {msg.user.displayName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {msg.content || (msg.file?.filename || "Voice message")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
        {/* Text channels */}
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
          Text Channels
        </div>

        <button
          onClick={() => onViewChange("chat")}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors",
            activeView === "chat"
              ? "bg-sidebar-active text-white"
              : "text-muted-foreground hover:bg-sidebar-hover hover:text-foreground"
          )}
        >
          <Hash className="w-4 h-4" />
          <span className="truncate">general</span>
        </button>

        <button
          onClick={() => onViewChange("notes")}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors",
            activeView === "notes"
              ? "bg-sidebar-active text-white"
              : "text-muted-foreground hover:bg-sidebar-hover hover:text-foreground"
          )}
        >
          <FileText className="w-4 h-4" />
          <span className="truncate">notes</span>
        </button>

        <button
          onClick={() => onViewChange("files")}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors",
            activeView === "files"
              ? "bg-sidebar-active text-white"
              : "text-muted-foreground hover:bg-sidebar-hover hover:text-foreground"
          )}
        >
          <FolderOpen className="w-4 h-4" />
          <span className="truncate">files</span>
        </button>

        {/* Voice channels */}
        <div className="pt-4">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Voice Channels
            </span>
            <Dialog open={isVoiceOpen} onOpenChange={setIsVoiceOpen}>
              <DialogTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Voice Channel</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    placeholder="Channel name"
                  />
                  <Button onClick={handleCreateVoice} disabled={!voiceName.trim()}>
                    Create
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {room.voiceChannels?.map((channel: any) => (
            <button
              key={channel.id}
              onClick={() => onVoiceChannelJoin(channel)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors",
                activeVoiceChannelId === channel.id
                  ? "bg-green-500/20 text-green-400"
                  : "text-muted-foreground hover:bg-sidebar-hover hover:text-foreground"
              )}
            >
              <Volume2 className={cn(
                "w-4 h-4",
                activeVoiceChannelId === channel.id ? "text-green-400" : "text-green-500"
              )} />
              <span className="truncate">{channel.name}</span>
              {activeVoiceChannelId === channel.id && (
                <span className="ml-auto flex gap-0.5">
                  <span className="w-1 h-3 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-3 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="w-1 h-3 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Room member count */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span>{room.members?.length || 0} members</span>
        </div>
      </div>
    </div>
  );
}
