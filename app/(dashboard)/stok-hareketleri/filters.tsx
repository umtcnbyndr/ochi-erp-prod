"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Counterparty {
  id: number
  name: string
}

interface Props {
  counterparties: Counterparty[]
}

const TYPE_OPTIONS = [
  { value: "IN", label: "Giriş" },
  { value: "OUT", label: "Çıkış" },
  { value: "EXCHANGE_OUT", label: "Takas Çıkış" },
  { value: "EXCHANGE_IN", label: "Takas Giriş" },
  { value: "EXCHANGE_COMPLETE", label: "Takas Tamamlandı" },
  { value: "ADJUSTMENT", label: "Düzeltme" },
  { value: "SET_CONSUMPTION", label: "Set Tüketimi" },
]

const INVOICE_OPTIONS = [
  { value: "1", label: "Bekleyen" },
  { value: "0", label: "Kesinleşen" },
]

export function StockMovementFilters({ counterparties }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const update = useCallback(
    (key: string, value: string | undefined) => {
      const sp = new URLSearchParams(params.toString())
      if (value) {
        sp.set(key, value)
      } else {
        sp.delete(key)
      }
      sp.delete("page")
      router.push(`${pathname}?${sp.toString()}`)
    },
    [params, pathname, router]
  )

  function clear() {
    router.push(pathname)
  }

  const hasFilters =
    params.has("q") ||
    params.has("type") ||
    params.has("cari") ||
    params.has("from") ||
    params.has("to") ||
    params.has("pending")

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex flex-wrap gap-3">
        {/* Arama */}
        <div className="flex-1 min-w-[180px] space-y-1">
          <Label className="text-xs">Ürün / Barkod</Label>
          <Input
            placeholder="Ara…"
            defaultValue={params.get("q") ?? ""}
            onChange={(e) => {
              const val = e.target.value.trim()
              update("q", val || undefined)
            }}
            size="sm"
          />
        </div>

        {/* Tip */}
        <div className="w-44 space-y-1">
          <Label className="text-xs">Hareket Tipi</Label>
          <Select
            value={params.get("type") ?? "all"}
            onValueChange={(v) => update("type", v === "all" ? undefined : v)}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Tümü" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tümü</SelectItem>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Cari */}
        <div className="w-48 space-y-1">
          <Label className="text-xs">Cari</Label>
          <Select
            value={params.get("cari") ?? "all"}
            onValueChange={(v) => update("cari", v === "all" ? undefined : v)}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Tümü" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tümü</SelectItem>
              {counterparties.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Fatura durumu */}
        <div className="w-40 space-y-1">
          <Label className="text-xs">Fatura Durumu</Label>
          <Select
            value={params.get("pending") ?? "all"}
            onValueChange={(v) => update("pending", v === "all" ? undefined : v)}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Tümü" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tümü</SelectItem>
              {INVOICE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Başlangıç tarihi */}
        <div className="w-40 space-y-1">
          <Label className="text-xs">Başlangıç</Label>
          <Input
            type="date"
            defaultValue={params.get("from") ?? ""}
            onChange={(e) => update("from", e.target.value || undefined)}
            size="sm"
          />
        </div>

        {/* Bitiş tarihi */}
        <div className="w-40 space-y-1">
          <Label className="text-xs">Bitiş</Label>
          <Input
            type="date"
            defaultValue={params.get("to") ?? ""}
            onChange={(e) => update("to", e.target.value || undefined)}
            size="sm"
          />
        </div>
      </div>

      {hasFilters && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={clear} className="h-7 text-xs">
            Filtreleri Temizle
          </Button>
        </div>
      )}
    </div>
  )
}
