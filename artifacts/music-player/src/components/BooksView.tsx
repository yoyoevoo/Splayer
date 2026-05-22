import { useState } from "react";
import { BookOpen, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBooks } from "@/lib/use-books";
import type { Book } from "@/lib/types";
import { BookDetailView } from "./BookDetailView";
import { AddBookDialog } from "./AddBookDialog";
import { cn } from "@/lib/utils";

export function BooksView() {
  const { books, loading, addBookFromFile, addBookFromUrl, removeBook } = useBooks();
  const [selected, setSelected] = useState<Book | null>(null);
  const [addOpen,  setAddOpen]  = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  if (selected) {
    // Sync book state in case progress was updated
    const latest = books.find((b) => b.id === selected.id) ?? selected;
    return <BookDetailView book={latest} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-card-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Audiobooks
        </span>
        <Button
          size="sm" variant="ghost"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : books.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
            <BookOpen className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No audiobooks yet</p>
            <p className="text-xs text-muted-foreground/70">
              Add a local file or a YouTube playlist to get started
            </p>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add audiobook
            </Button>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {books.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelected(b)}
                className={cn(
                  "w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left",
                  "hover:bg-muted/60 transition-colors group",
                )}
              >
                {b.coverUrl ? (
                  <img src={b.coverUrl} alt="" className="w-10 h-10 rounded shrink-0 object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded bg-primary/15 flex items-center justify-center shrink-0 text-lg">
                    📖
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{b.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{b.author || "Unknown Author"}</p>
                  {b.progress != null && b.progress > 0 && b.duration && b.duration > 0 && (
                    <div className="mt-1 h-0.5 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min((b.progress / b.duration) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <Button
                  size="icon" variant="ghost"
                  className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                  disabled={deleting === b.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleting(b.id);
                    removeBook(b.id).finally(() => setDeleting(null));
                  }}
                  title="Remove audiobook"
                >
                  {deleting === b.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2  className="w-3.5 h-3.5" />}
                </Button>
              </button>
            ))}
          </div>
        )}
      </div>

      <AddBookDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAddUrl={addBookFromUrl}
        onAddFile={addBookFromFile}
      />
    </div>
  );
}
