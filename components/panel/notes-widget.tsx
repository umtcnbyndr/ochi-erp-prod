"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { StickyNote, Plus, Trash2, Pin, PinOff, Loader2, Check } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  createNoteAction,
  toggleNoteDoneAction,
  togglePinNoteAction,
  deleteNoteAction,
} from "@/app/(dashboard)/panel/actions"

export interface NoteItem {
  id: number
  text: string
  done: boolean
  pinned: boolean
  createdAt: Date
}

interface Props {
  notes: NoteItem[]
}

export function NotesWidget({ notes }: Props) {
  const router = useRouter()
  const [text, setText] = useState("")
  const [pending, startTransition] = useTransition()

  function handleAdd() {
    if (!text.trim()) {
      toast.error("Not boş olamaz")
      return
    }
    startTransition(async () => {
      const r = await createNoteAction(text.trim())
      if (!r.success) {
        toast.error(r.error ?? "Eklenemedi")
        return
      }
      setText("")
      router.refresh()
    })
  }

  function handleToggleDone(id: number) {
    startTransition(async () => {
      const r = await toggleNoteDoneAction(id)
      if (!r.success) toast.error(r.error ?? "İşaretlenemedi")
      router.refresh()
    })
  }

  function handleTogglePin(id: number) {
    startTransition(async () => {
      const r = await togglePinNoteAction(id)
      if (!r.success) toast.error(r.error ?? "Sabitlenemedi")
      router.refresh()
    })
  }

  function handleDelete(id: number) {
    if (!confirm("Notu sil?")) return
    startTransition(async () => {
      const r = await deleteNoteAction(id)
      if (!r.success) toast.error(r.error ?? "Silinemedi")
      router.refresh()
    })
  }

  const undoneCount = notes.filter((n) => !n.done).length

  return (
    <Card className="h-full">
      <CardContent className="p-6 space-y-3 h-full flex flex-col">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-yellow-500" />
            <h3 className="text-sm font-semibold">Notlar</h3>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {undoneCount}/{notes.length}
          </span>
        </div>

        {/* Add form */}
        <div className="flex gap-1.5">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Yeni not..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleAdd()
              }
            }}
            className="h-8 text-xs"
            disabled={pending}
            maxLength={500}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0 shrink-0"
            onClick={handleAdd}
            disabled={pending || !text.trim()}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {/* Note list */}
        {notes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Henüz not yok.</p>
          </div>
        ) : (
          <ul className="space-y-0.5 -mx-1 overflow-y-auto flex-1 max-h-[260px]">
            {notes.map((n) => (
              <li
                key={n.id}
                className={`group flex items-start gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent/50 ${
                  n.pinned ? "bg-yellow-50/40 dark:bg-yellow-950/10" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleToggleDone(n.id)}
                  disabled={pending}
                  className="shrink-0 mt-0.5"
                  aria-label={n.done ? "Geri al" : "Tamamlandı"}
                >
                  <span
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border transition-colors ${
                      n.done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-muted-foreground/40 bg-background hover:border-foreground"
                    }`}
                  >
                    {n.done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                  </span>
                </button>
                <span
                  className={`flex-1 leading-snug ${
                    n.done ? "line-through text-muted-foreground" : ""
                  }`}
                >
                  {n.text}
                </span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTogglePin(n.id)}
                    disabled={pending}
                    className="rounded p-0.5 hover:bg-background"
                    aria-label={n.pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
                  >
                    {n.pinned ? (
                      <PinOff className="h-3 w-3 text-yellow-600" />
                    ) : (
                      <Pin className="h-3 w-3 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(n.id)}
                    disabled={pending}
                    className="rounded p-0.5 hover:bg-background"
                    aria-label="Sil"
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-red-500" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
