"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { Search, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { searchComponents } from "./actions"
import { cn } from "@/lib/utils"

interface Candidate {
  id: number
  name: string
  primaryBarcode: string
  mainStock: number
  mainPurchasePrice: string | null
  psf: string | null
}

interface ComponentPickerProps {
  excludeIds: number[]
  onPick: (c: Candidate) => void
}

export function ComponentPicker({ excludeIds, onPick }: ComponentPickerProps) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Candidate[]>([])
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const containerRef = useRef<HTMLDivElement>(null)

  // Dışarı tıklanırsa kapat
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  // Debounced search
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    const t = setTimeout(() => {
      startTransition(async () => {
        const res = await searchComponents(q, excludeIds)
        if (res.success) {
          setResults(res.data ?? [])
          setOpen(true)
        } else {
          setResults([])
        }
      })
    }, 250)
    return () => clearTimeout(t)
  }, [q, excludeIds])

  function handlePick(c: Candidate) {
    onPick(c)
    setQ("")
    setResults([])
    setOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Bileşen ara (ürün adı, barkod, eczane kodu)..."
          className="h-9 pl-9 pr-10"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => q.trim().length >= 2 && setOpen(true)}
        />
        {pending && (
          <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border bg-popover shadow-lg">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => handlePick(r)}
              className={cn(
                "flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted"
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {r.primaryBarcode}
                  {r.mainPurchasePrice && (
                    <>
                      {" · "}
                      <span>{Number(r.mainPurchasePrice).toFixed(2)} ₺</span>
                    </>
                  )}
                </p>
              </div>
              <span
                className={cn(
                  "whitespace-nowrap tabular-nums text-xs",
                  r.mainStock === 0
                    ? "text-destructive"
                    : r.mainStock < 5
                      ? "text-warning"
                      : "text-muted-foreground"
                )}
              >
                Stok: {r.mainStock}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && results.length === 0 && q.trim().length >= 2 && !pending && (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover p-3 text-center text-sm text-muted-foreground shadow-lg">
          Eşleşen ürün bulunamadı
        </div>
      )}
    </div>
  )
}
