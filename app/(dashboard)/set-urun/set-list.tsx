"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Package, Search, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency } from "@/lib/utils"

export interface SetListItem {
  id: number
  name: string
  primaryBarcode: string
  setSku: string | null
  status: string
  brand: { id: number; name: string }
  category: { id: number; name: string }
  componentCount: number
  availableStock: number
  computedPurchasePrice: number
  psf: string | null
}

interface Props {
  sets: SetListItem[]
}

export function SetList({ sets }: Props) {
  const [search, setSearch] = useState("")
  const [brandId, setBrandId] = useState<string>("all")
  const [categoryId, setCategoryId] = useState<string>("all")
  const [status, setStatus] = useState<string>("all")

  // Unique brand/category listesi (sadece veri içindekiler)
  const brands = useMemo(() => {
    const map = new Map<number, string>()
    sets.forEach((s) => map.set(s.brand.id, s.brand.name))
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"))
  }, [sets])

  const categories = useMemo(() => {
    const map = new Map<number, string>()
    sets.forEach((s) => map.set(s.category.id, s.category.name))
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"))
  }, [sets])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sets.filter((s) => {
      if (q) {
        const hay =
          s.name.toLowerCase() +
          " " +
          s.primaryBarcode.toLowerCase() +
          " " +
          (s.setSku ?? "").toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (brandId !== "all" && String(s.brand.id) !== brandId) return false
      if (categoryId !== "all" && String(s.category.id) !== categoryId) return false
      if (status !== "all" && s.status !== status) return false
      return true
    })
  }, [sets, search, brandId, categoryId, status])

  const hasActiveFilter =
    search.trim() !== "" || brandId !== "all" || categoryId !== "all" || status !== "all"

  return (
    <div className="space-y-3">
      {/* Filtre barı */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ürün adı, barkod veya SKU ara..."
                className="pl-9 h-9 text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-2.5"
                >
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>

            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger className="w-full sm:w-[160px] h-9 text-sm">
                <SelectValue placeholder="Tüm Markalar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Markalar</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-full sm:w-[160px] h-9 text-sm">
                <SelectValue placeholder="Tüm Kategoriler" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Kategoriler</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-[130px] h-9 text-sm">
                <SelectValue placeholder="Durum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Durumlar</SelectItem>
                <SelectItem value="ACTIVE">Aktif</SelectItem>
                <SelectItem value="PASSIVE">Pasif</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("")
                  setBrandId("all")
                  setCategoryId("all")
                  setStatus("all")
                }}
                className="h-9 text-xs text-muted-foreground"
              >
                Temizle
              </Button>
            )}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {filtered.length} / {sets.length} set gösteriliyor
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            Bu filtreye uyan set yok.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile: kart görünümü */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filtered.map((s) => (
              <Link key={s.id} href={`/set-urun/${s.id}`}>
                <Card className="hover:border-primary/30 hover:shadow-md transition-all">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{s.name}</div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {s.primaryBarcode}
                            {s.setSku ? ` · ${s.setSku}` : ""}
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant={s.status === "ACTIVE" ? "success" : "outline"}
                        className="shrink-0"
                      >
                        {s.status === "ACTIVE" ? "Aktif" : "Pasif"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{s.brand.name}</div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-[10px] text-muted-foreground">Bileşen</div>
                        <div className="text-sm font-semibold tabular-nums">{s.componentCount}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">Sanal Stok</div>
                        <div
                          className={`text-sm font-semibold tabular-nums ${
                            s.availableStock === 0
                              ? "text-destructive"
                              : s.availableStock < 5
                                ? "text-warning"
                                : ""
                          }`}
                        >
                          {s.availableStock}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">Alış</div>
                        <div className="text-sm font-semibold tabular-nums">
                          {s.computedPurchasePrice > 0
                            ? formatCurrency(s.computedPurchasePrice.toFixed(2))
                            : "—"}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Desktop: tablo görünümü */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table containerClassName="max-h-[calc(100dvh-16rem)]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Set Adı</TableHead>
                    <TableHead>Marka</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Bileşen</TableHead>
                    <TableHead className="text-right">Sanal Stok</TableHead>
                    <TableHead className="text-right">Hesaplanan Alış</TableHead>
                    <TableHead className="text-right">PSF</TableHead>
                    <TableHead>Durum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id} className="cursor-pointer">
                      <TableCell className="font-medium">
                        <Link
                          href={`/set-urun/${s.id}`}
                          className="flex items-center gap-2 hover:text-primary"
                        >
                          <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <div className="truncate">{s.name}</div>
                            <div className="text-xs text-muted-foreground tabular-nums">
                              {s.primaryBarcode}
                              {s.setSku ? ` · ${s.setSku}` : ""}
                            </div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{s.brand.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.category.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.componentCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span
                          className={
                            s.availableStock === 0
                              ? "text-destructive font-semibold"
                              : s.availableStock < 5
                                ? "text-warning font-semibold"
                                : ""
                          }
                        >
                          {s.availableStock}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.computedPurchasePrice > 0
                          ? formatCurrency(s.computedPurchasePrice.toFixed(2))
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.psf ? formatCurrency(s.psf) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={s.status === "ACTIVE" ? "success" : "outline"}
                        >
                          {s.status === "ACTIVE" ? "Aktif" : "Pasif"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
