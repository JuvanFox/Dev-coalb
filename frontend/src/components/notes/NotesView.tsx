import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDate, getInitials } from "@/lib/utils";
import {
  Plus,
  FileText,
  Lock,
  Globe,
  Edit3,
  Trash2,
  Eye,
} from "lucide-react";

interface NotesViewProps {
  room: any;
}

export function NotesView({ room }: NotesViewProps) {
  const { user } = useAuthStore();
  const [notes, setNotes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<any | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const fetchNotes = async () => {
    try {
      const res = await api.getNotes(room.id);
      setNotes(res.notes);
    } catch (err) {
      console.error("Failed to fetch notes:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    fetchNotes();
  }, [room.id]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    try {
      await api.createNote(room.id, {
        title: title.trim(),
        content,
        isPrivate,
      });
      setIsCreateOpen(false);
      setTitle("");
      setContent("");
      setIsPrivate(false);
      fetchNotes();
    } catch (err) {
      console.error("Failed to create note:", err);
    }
  };

  const handleUpdate = async () => {
    if (!editingNote || !title.trim()) return;
    try {
      await api.updateNote(room.id, editingNote.id, {
        title: title.trim(),
        content,
        isPrivate,
      });
      setEditingNote(null);
      setTitle("");
      setContent("");
      setEditingNote(false);
      fetchNotes();
    } catch (err) {
      console.error("Failed to update note:", err);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm("Delete this note?")) return;
    try {
      await api.deleteNote(room.id, noteId);
      fetchNotes();
    } catch (err) {
      console.error("Failed to delete note:", err);
    }
  };

  const openEdit = (note: any) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setIsPrivate(note.isPrivate);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">Notes</h2>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" />
              New Note
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Note</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note title"
              />
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your note here..."
                className="w-full h-64 bg-background border border-input rounded-md p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-muted-foreground">
                  Private note (only visible to you)
                </span>
              </label>
              <Button onClick={handleCreate} disabled={!title.trim()} className="w-full">
                Create Note
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-sidebar-hover rounded-lg animate-pulse" />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No notes yet</p>
            </div>
          </div>
        ) : (
          <div className="p-4 grid gap-3 md:grid-cols-2">
            {notes.map((note) => (
              <div
                key={note.id}
                className="p-4 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <h3 className="font-medium text-sm truncate">{note.title}</h3>
                    {note.isPrivate ? (
                      <Lock className="w-3 h-3 text-yellow-500 shrink-0" />
                    ) : (
                      <Globe className="w-3 h-3 text-green-500 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(note)}
                      className="text-muted-foreground hover:text-foreground p-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {note.userId === user?.id && (
                      <button
                        onClick={() => handleDelete(note.id)}
                        className="text-muted-foreground hover:text-destructive p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2 line-clamp-3">
                  {note.content}
                </p>
                <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                  <span>{note.user.displayName}</span>
                  <span>{formatDate(note.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Edit Note Dialog */}
      <Dialog open={!!editingNote} onOpenChange={(open) => !open && setEditingNote(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your note here..."
              className="w-full h-64 bg-background border border-input rounded-md p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-muted-foreground">
                Private note
              </span>
            </label>
            <Button onClick={handleUpdate} disabled={!title.trim()} className="w-full">
              Update Note
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
