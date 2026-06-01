import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { getSocket } from "@/lib/socket";
import { api } from "@/lib/api";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { playMessageNotification } from "@/lib/sounds";

interface ChatViewProps {
  room: any;
}

export function ChatView({ room }: ChatViewProps) {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch messages
  const loadMessages = async (loadMore = false) => {
    try {
      const res = await api.getMessages(
        room.id,
        loadMore ? cursor || undefined : undefined
      );
      if (loadMore) {
        setMessages((prev) => [...res.messages, ...prev]);
      } else {
        setMessages(res.messages);
      }
      setCursor(res.nextCursor);
      setHasMore(res.nextCursor !== null);
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    setMessages([]);
    setCursor(null);
    setHasMore(true);
    loadMessages();
  }, [room.id]);

  // Socket.IO listeners
  useEffect(() => {
    const socket = getSocket();

    socket.on("message:new", (message: any) => {
      if (message.roomId === room.id) {
        setMessages((prev) => [...prev, message]);
        // Scroll to bottom on new message
        setTimeout(() => {
          bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);

        // Play notification sound for incoming messages from others
        // (skip own messages and skip if user is actively looking at the tab)
        if (message.userId !== user?.id) {
          playMessageNotification();
        }
      }
    });

    socket.on("message:delete", ({ messageId }: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    });

    // ─── Reaction events ──────────────────────────────
    socket.on("reaction:added", ({ messageId, reaction }: { messageId: string; reaction: any }) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const existing = m.reactions || [];
          // Don't duplicate
          if (existing.some((r: any) => r.id === reaction.id)) return m;
          return { ...m, reactions: [...existing, reaction] };
        })
      );
    });

    socket.on("reaction:removed", ({ messageId, userId, emoji }: { messageId: string; userId: string; emoji: string }) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const existing = m.reactions || [];
          return {
            ...m,
            reactions: existing.filter(
              (r: any) => !(r.userId === userId && r.emoji === emoji)
            ),
          };
        })
      );
    });

    return () => {
      socket.off("message:new");
      socket.off("message:delete");
      socket.off("reaction:added");
      socket.off("reaction:removed");
    };
  }, [room.id]);

  // Auto-scroll to bottom on initial load
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      bottomRef.current?.scrollIntoView();
    }
  }, [isLoading]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="min-h-full flex flex-col justify-end">
          {hasMore && (
            <div className="px-4 py-2 text-center">
              <button
                onClick={() => loadMessages(true)}
                className="text-xs text-primary hover:underline"
              >
                Load older messages
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="space-y-3 w-full px-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-sidebar-hover shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-sidebar-hover rounded w-1/4" />
                      <div className="h-4 bg-sidebar-hover rounded w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <p className="text-lg">Welcome to #{room.name}</p>
                <p className="text-sm mt-1">This is the start of the conversation.</p>
              </div>
            </div>
          ) : (
            <div className="py-2">
              {messages.map((message, idx) => {
                const prevMessage = idx > 0 ? messages[idx - 1] : null;
                const showAuthor = !prevMessage || prevMessage.userId !== message.userId;
                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    showAuthor={showAuthor}
                    isOwn={message.userId === user?.id}
                  />
                );
              })}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Message Input */}
      <MessageInput roomId={room.id} />
    </div>
  );
}
