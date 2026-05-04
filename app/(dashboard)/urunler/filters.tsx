"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useCallback, useEffect, useState, useTransition } from "react"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Option {
  id: number
  name: string
}

interface FilterProps {
  brands: Option[]
  categories: (Option & { subcategories: Option[] })[]
  pageSize: number | "all"
  total: number
  loaded: number
}

const PAGE_SIZES = ["50", "100", "250", "1000", "all"] as const

const QUICK_CHIPS: {
  key:
    | "psfMissing"
    | "mainPriceMissing"
    | "streetPriceMissing"
    | "hasStreet"
    | "pharmacyStockOnly"
    | "hasExchange"
    | "lowStock"
    | "passive"
  label: string
  hint: string
}[] = [
  { key: "psfMissing", label: "PSF eksik", hint: "PSF fiyatı girilmemiş" },
  { key: "mainPriceMissing", label: "Ana alış eksik", hint: "Ana alış boş veya 0" },
  { key: "streetPriceMissing", label: "Cadde alış eksik", hint: "Cadde alış boş" },
  { key: "hasStreet", label: "Cadde stok var", hint: "streetStock > 0" },
  {
    key: "pharmacyStockOnly",
    label: "Eczane stoğundan açık",
    hint: "Ana depo boş, eczane stoğundan satılan ürünler",
  },
  { key: "hasExchange", label: "Takasta", hint: "Takas stoğu olan" },
  { key: "lowStock", label: "Düşük stok", hint: "Ana stok ≤ min stok" },
  { key: "passive", label: "Pasif", hint: "Durum pasif" },
]

export function ProductFilters({
  brands,
  categories,
  pageSize,
  total,
  loaded,
}: FilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, startTransition] = useTransition()

  const current = {
    search: params.get("q") ?? "",
    brandId: params.get("brand") ?? "",
    categoryId: params.get("cat") ?? "",
    subcategoryId: params.get("sub") ?? "",
    productType: params.get("tip") ?? "",
    minStock: params.get("minStock") ?? "",
    maxStock: params.get("maxStock") ?? "",
  }

  const [search, setSearch] = useState(current.search)
  const [minStock, setMinStock] = useState(current.minStock)
  const [maxStock, setMaxStock] = useState(current.maxStock)

  useEffect(() => {
    setSearch(current.search)
    setMinStock(current.minStock)
    setMaxStock(current.maxStock)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const applyFilters = useCallback(
    (overrides: Partial<typeof current> & { ps?: string } = {}) => {
      const next = new URLSearchParams(params.toString())
      const val = { ...current, ...overrides }

      const setOrDelete = (k: string, v: string) =>
        v ? next.set(k, v) : next.delete(k)

      setOrDelete("q", val.search)
      setOrDelete("brand", val.brandId)
      setOrDelete("cat", val.categoryId)
      setOrDelete("sub", val.subcategoryId)
      setOrDelete("tip", val.productType)
      setOrDelete("minStock", val.minStock)
      setOrDelete("maxStock", val.maxStock)
      if (overrides.ps !== undefined) next.set("ps", overrides.ps)
      // Sayfa değişince 1'e dön
      next.delete("page")

      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`)
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, params, pathname, router]
  )

  function toggleChip(key: (typeof QUICK_CHIPS)[number]["key"]) {
    const next = new URLSearchParams(params.toString())
    if (key === "passive") {
      if (next.get("status") === "PASSIVE") next.delete("status")
      else next.set("status", "PASSIVE")
    } else {
      if (next.get(key) === "1") next.delete(key)
      else next.set(key, "1")
    }
    next.delete("page")
    startTransition(() => router.push(`${pathname}?${next.toString()}`))
  }

  function isChipActive(key: (typeof QUICK_CHIPS)[number]["key"]) {
    if (key === "passive") return params.get("status") === "PASSIVE"
    return params.get(key) === "1"
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    applyFilters({ search })
  }

  function clearAll() {
    startTransition(() => router.push(pathname))
  }

  const activeFilterCount =
    [
      current.search,
      current.brandId,
      current.categoryId,
      current.subcategoryId,
      current.productType,
      current.minStock,
      current.maxStock,
    ].filter(Boolean).length + QUICK_CHIPS.filter((c) => isChipActive(c.key)).length

  const activeCategory = categories.find((c) => String(c.id) === current.categoryId)

  return (
    <div className="space-y-2.5">
      {/* Ana filtre satırı */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Arama */}
        <form onSubmit={onSearchSubmit} className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Ürün adı, barkod veya eczane kodu ara..."
            className="h-9 pl-9 pr-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("")
                applyFilters({ search: "" })
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 hover:bg-muted"
              aria-label="Aramayı temizle"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </form>

        {/* Marka */}
        <Select
          value={current.brandId || "_all"}
          onValueChange={(v) => applyFilters({ brandId: v === "_all" ? "" : v })}
        >
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="Tüm Markalar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Tüm Markalar</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Kategori */}
        <Select
          value={current.categoryId || "_all"}
          onValueChange={(v) =>
            applyFilters({
              categoryId: v === "_all" ? "" : v,
              subcategoryId: "",
            })
          }
        >
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="Tüm Kategoriler" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Tüm Kategoriler</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Alt Kategori — her zaman aktif; kategori seçiliyse sadece o kategorinin altları,
            değilse tümü (parent prefix'iyle) listelenir */}
        <Select
          value={current.subcategoryId || "_all"}
          onValueChange={(v) => applyFilters({ subcategoryId: v === "_all" ? "" : v })}
        >
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue placeholder="Tüm Alt Kategoriler" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Tüm Alt Kategoriler</SelectItem>
            {activeCategory
              ? activeCategory.subcategories.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))
              : categories.flatMap((c) =>
                  c.subcategories.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      <span className="text-muted-foreground text-xs">{c.name} / </span>
                      {s.name}
                    </SelectItem>
                  ))
                )}
          </SelectContent>
        </Select>

        {/* Tip */}
        <Select
          value={current.productType || "_all"}
          onValueChange={(v) => applyFilters({ productType: v === "_all" ? "" : v })}
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder="Tüm Tipler" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Tüm Tipler</SelectItem>
            <SelectItem value="SINGLE">Tekli</SelectItem>
            <SelectItem value="SET">Set</SelectItem>
            <SelectItem value="GIFT">Hediye</SelectItem>
          </SelectContent>
        </Select>

        {/* Stok aralığı */}
        <Input
          type="number"
          min="0"
          placeholder="Min stok"
          className="h-9 w-[100px]"
          value={minStock}
          onChange={(e) => setMinStock(e.target.value)}
          onBlur={() => current.minStock !== minStock && applyFilters({ minStock })}
          onKeyDown={(e) => e.key === "Enter" && applyFilters({ minStock })}
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="number"
          min="0"
          placeholder="Max stok"
          className="h-9 w-[100px]"
          value={maxStock}
          onChange={(e) => setMaxStock(e.target.value)}
          onBlur={() => current.maxStock !== maxStock && applyFilters({ maxStock })}
          onKeyDown={(e) => e.key === "Enter" && applyFilters({ maxStock })}
        />

        {/* Sayfa boyutu */}
        <Select value={String(pageSize)} onValueChange={(v) => applyFilters({ ps: v })}>
          <SelectTrigger className="h-9 w-[90px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((p) => (
              <SelectItem key={p} value={p}>
                {p === "all" ? "Hepsi" : p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sayım */}
        <span className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
          {loaded} / {total} ürün
        </span>

        {/* Temizle */}
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="h-4 w-4" />
            Temizle ({activeFilterCount})
          </Button>
        )}
      </div>

      {/* Hızlı filtre chip'leri */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground mr-1">Hızlı:</span>
        {QUICK_CHIPS.map((chip) => {
          const active = isChipActive(chip.key)
          return (
            <Badge
              key={chip.key}
              variant={active ? "default" : "outline"}
              className={cn(
                "cursor-pointer select-none h-6 px-2 text-xs transition-colors",
                !active && "hover:bg-muted"
              )}
              title={chip.hint}
              onClick={() => toggleChip(chip.key)}
            >
              {chip.label}
              {active && <X className="ml-1 h-3 w-3" />}
            </Badge>
          )
        })}
      </div>
    </div>
  )
}
