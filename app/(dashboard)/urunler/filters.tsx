"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useCallback, useEffect, useState, useTransition } from "react"
import { Search, X, SlidersHorizontal } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Label } from "@/components/ui/label"

interface Option {
  id: number
  name: string
}

interface FilterProps {
  brands: Option[]
  categories: (Option & { subcategories: Option[] })[]
}

export function ProductFilters({ brands, categories }: FilterProps) {
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
  const [brandId, setBrandId] = useState(current.brandId)
  const [categoryId, setCategoryId] = useState(current.categoryId)
  const [subcategoryId, setSubcategoryId] = useState(current.subcategoryId)
  const [productType, setProductType] = useState(current.productType)
  const [minStock, setMinStock] = useState(current.minStock)
  const [maxStock, setMaxStock] = useState(current.maxStock)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setSearch(current.search)
    setBrandId(current.brandId)
    setCategoryId(current.categoryId)
    setSubcategoryId(current.subcategoryId)
    setProductType(current.productType)
    setMinStock(current.minStock)
    setMaxStock(current.maxStock)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const applyFilters = useCallback(
    (overrides: Partial<typeof current> = {}) => {
      const next = new URLSearchParams()
      const val = { ...current, ...overrides }
      if (val.search) next.set("q", val.search)
      if (val.brandId) next.set("brand", val.brandId)
      if (val.categoryId) next.set("cat", val.categoryId)
      if (val.subcategoryId) next.set("sub", val.subcategoryId)
      if (val.productType) next.set("tip", val.productType)
      if (val.minStock) next.set("minStock", val.minStock)
      if (val.maxStock) next.set("maxStock", val.maxStock)
      // page reset, pageSize korunur
      const ps = params.get("ps")
      if (ps) next.set("ps", ps)
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`)
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, params, pathname, router]
  )

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    applyFilters({ search })
  }

  function clearAll() {
    setSearch("")
    setBrandId("")
    setCategoryId("")
    setSubcategoryId("")
    setProductType("")
    setMinStock("")
    setMaxStock("")
    startTransition(() => router.push(pathname))
  }

  const activeCount = [
    current.search,
    current.brandId,
    current.categoryId,
    current.subcategoryId,
    current.productType,
    current.minStock,
    current.maxStock,
  ].filter(Boolean).length

  const activeCategory = categories.find((c) => String(c.id) === categoryId)

  const filterInputs = (
    <>
      <FilterRow label="Marka">
        <Select
          value={brandId || "_all"}
          onValueChange={(v) => {
            const nv = v === "_all" ? "" : v
            setBrandId(nv)
            applyFilters({ brandId: nv })
          }}
        >
          <SelectTrigger><SelectValue placeholder="Tümü" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Tüm markalar</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>

      <FilterRow label="Kategori">
        <Select
          value={categoryId || "_all"}
          onValueChange={(v) => {
            const nv = v === "_all" ? "" : v
            setCategoryId(nv)
            setSubcategoryId("")
            applyFilters({ categoryId: nv, subcategoryId: "" })
          }}
        >
          <SelectTrigger><SelectValue placeholder="Tümü" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Tüm kategoriler</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>

      {activeCategory && activeCategory.subcategories.length > 0 && (
        <FilterRow label="Alt Kategori">
          <Select
            value={subcategoryId || "_all"}
            onValueChange={(v) => {
              const nv = v === "_all" ? "" : v
              setSubcategoryId(nv)
              applyFilters({ subcategoryId: nv })
            }}
          >
            <SelectTrigger><SelectValue placeholder="Tümü" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Tümü</SelectItem>
              {activeCategory.subcategories.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterRow>
      )}

      <FilterRow label="Ürün Tipi">
        <Select
          value={productType || "_all"}
          onValueChange={(v) => {
            const nv = v === "_all" ? "" : v
            setProductType(nv)
            applyFilters({ productType: nv })
          }}
        >
          <SelectTrigger><SelectValue placeholder="Tümü" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Tümü</SelectItem>
            <SelectItem value="SINGLE">Tekil</SelectItem>
            <SelectItem value="SET">Set</SelectItem>
            <SelectItem value="GIFT">Hediye</SelectItem>
          </SelectContent>
        </Select>
      </FilterRow>

      <FilterRow label="Stok Aralığı">
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            min="0"
            placeholder="Min"
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
            onBlur={() => applyFilters({ minStock })}
          />
          <Input
            type="number"
            min="0"
            placeholder="Max"
            value={maxStock}
            onChange={(e) => setMaxStock(e.target.value)}
            onBlur={() => applyFilters({ maxStock })}
          />
        </div>
      </FilterRow>
    </>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form onSubmit={onSearchSubmit} className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Barkod, eczane kodu, ürün adı ara..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(""); applyFilters({ search: "" }) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 hover:bg-muted"
              aria-label="Aramayı temizle"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </form>

        {/* Desktop: inline filters button opens a sheet with all filters */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filtreler
              {activeCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {activeCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Filtreler</SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-4">{filterInputs}</div>
            {activeCount > 0 && (
              <Button variant="outline" onClick={clearAll} className="mt-6 w-full">
                Tüm filtreleri temizle
              </Button>
            )}
          </SheetContent>
        </Sheet>

        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground">
            <X className="h-4 w-4" />
            Temizle
          </Button>
        )}
      </div>
    </div>
  )
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}
