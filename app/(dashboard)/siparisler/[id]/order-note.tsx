"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Check, X, Loader2, StickyNote } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { updateOrderNoteAction } from "../actions"

interface Props {
  orderId: number
  note: string | null
}

export function OrderNote({ orderId, note }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(note ?? "")
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const result = await updateOrderNoteAction(orderId, value)
      if (result.success) {
        toast.success("Not kaydedildi")
        setEditing(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  if (editing) {
    return (
      <Card>
        <CardContent className="py-3 space-y-2">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Sipariş notu — örn. Acil, Pazartesi'ye kadar"
            rows={2}
            className="text-sm"
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              )}
              Kaydet
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setValue(note ?? "")
                setEditing(false)
              }}
              disabled={pending}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Vazgeç
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="py-3 flex items-start justify-between gap-3 text-sm">
        <div className="flex items-start gap-2 min-w-0">
          <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
          {note ? (
            <span className="whitespace-pre-wrap break-words">{note}</span>
          ) : (
            <span className="text-muted-foreground italic">Not yok</span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 h-7"
          onClick={() => setEditing(true)}
        >
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          {note ? "Düzenle" : "Not ekle"}
        </Button>
      </CardContent>
    </Card>
  )
}
