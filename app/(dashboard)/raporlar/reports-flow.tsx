"use client"

import { useTransition } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import {
  Layers,
  AlertTriangle,
  Clock,
  Download,
  TrendingUp,
  Building2,
  Calendar,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
  exportInventoryExcel,
  exportStaleProductsExcel,
  exportPharmacyStockExcel,
  exportTopMoversExcel,
  exportExpiryExcel,
  exportRiskOverviewExcel,
} from "./actions"
import { StockTab } from "./tab-stock"
import { StaleTab } from "./tab-stale"
import { RiskTab } from "./tab-risk"
import { TopMoversTab } from "./tab-top-movers"
import { PharmacyTab } from "./tab-pharmacy"
import { ExpiryTab } from "./tab-expiry"
import type {
  StockSummary,
  BrandCategoryRow,
  RiskOverview,
  TopMoversResult,
  PharmacyStockReport,
  ExpiryBucket,
} from "@/lib/services/reports"

interface StaleSerialized {
  summary: {
    totalCount: number
    totalCapital: number
    oldestProductDays: number | null
    oldestProductName: string | null
  }
  products: Array<{
    productId: number
    productName: string
    primaryBarcode: string
    brandName: string
    categoryName: string
    mainStock: number
    streetStock: number
    totalStock: number
    stockValue: number
    daysSinceLastMovement: number | null
    lastMovementDate: string | null
    risk: "LOW" | "MEDIUM" | "HIGH"
  }>
}

interface ExpirySerialized {
  buckets: Record<
    ExpiryBucket,
    { label: string; count: number; totalStock: number; totalValue: number }
  >
  totalImpactValue: number
  totalImpactStock: number
  products: Array<{
    productId: number
    productName: string
    primaryBarcode: string
    brandName: string
    categoryName: string
    expirationDate: string
    daysLeft: number
    bucket: ExpiryBucket
    mainStock: number
    streetStock: number
    totalStock: number
    unitValue: number
    totalValue: number
  }>
}

interface Props {
  initialTab: "stok" | "hareketsiz" | "risk" | "cok-satan" | "eczane" | "skt"
  brands: { id: number; name: string }[]
  categories: { id: number; name: string }[]
  currentFilters: {
    brandId?: number
    categoryId?: number
    daysSinceMovement: number
    movePeriod: number
  }
  stockSummary: StockSummary
  breakdown: BrandCategoryRow[]
  stale: StaleSerialized
  risk: RiskOverview
  topMovers: TopMoversResult
  pharmacyReport: PharmacyStockReport
  expiry: ExpirySerialized
}

function downloadExcel(base64: string, filename: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function ReportsFlow({
  initialTab,
  brands,
  categories,
  currentFilters,
  stockSummary,
  breakdown,
  stale,
  risk,
  topMovers,
  pharmacyReport,
  expiry,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  function setQuery(updates: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v == null || v === "") next.delete(k)
      else next.set(k, v)
    }
    router.push(`${pathname}?${next.toString()}`)
  }

  function changeTab(tab: string) {
    setQuery({ tab })
  }

  function changeBrand(v: string) {
    setQuery({ brand: v === "_all" ? undefined : v })
  }

  function changeCategory(v: string) {
    setQuery({ category: v === "_all" ? undefined : v })
  }

  function changeDays(v: string) {
    setQuery({ days: v })
  }

  function changeMovePeriod(v: string) {
    setQuery({ movePeriod: v })
  }

  async function onExport(
    type:
      | "inventory"
      | "stale"
      | "risk"
      | "topmovers"
      | "pharmacy"
      | "expiry",
  ) {
    startTransition(async () => {
      try {
        let result: { base64: string; filename: string }
        if (type === "inventory") {
          result = await exportInventoryExcel({
            brandId: currentFilters.brandId,
            categoryId: currentFilters.categoryId,
          })
        } else if (type === "stale") {
          result = await exportStaleProductsExcel({
            daysSinceMovement: currentFilters.daysSinceMovement,
            brandId: currentFilters.brandId,
            categoryId: currentFilters.categoryId,
          })
        } else if (type === "topmovers") {
          result = await exportTopMoversExcel({
            daysPeriod: currentFilters.movePeriod,
            brandId: currentFilters.brandId,
            categoryId: currentFilters.categoryId,
          })
        } else if (type === "pharmacy") {
          result = await exportPharmacyStockExcel({
            brandId: currentFilters.brandId,
          })
        } else if (type === "expiry") {
          result = await exportExpiryExcel({
            brandId: currentFilters.brandId,
          })
        } else {
          result = await exportRiskOverviewExcel()
        }
        downloadExcel(result.base64, result.filename)
        toast.success(`${result.filename} indirildi`)
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Excel oluşturulamadı",
        )
      }
    })
  }

  return (
    <Tabs value={initialTab} onValueChange={changeTab} className="w-full">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="stok" className="gap-1.5">
            <Layers className="h-4 w-4" /> Stok Özeti
          </TabsTrigger>
          <TabsTrigger value="cok-satan" className="gap-1.5">
            <TrendingUp className="h-4 w-4" /> Çok Satan
            {topMovers.products.length > 0 && (
              <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 text-[10px] font-medium text-emerald-700">
                {topMovers.products.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="hareketsiz" className="gap-1.5">
            <Clock className="h-4 w-4" /> Hareketsiz
            {stale.summary.totalCount > 0 && (
              <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 text-[10px] font-medium text-amber-700">
                {stale.summary.totalCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="eczane" className="gap-1.5">
            <Building2 className="h-4 w-4" /> Eczane Stok
            {pharmacyReport.topExcessProducts.length > 0 && (
              <span className="ml-1 rounded-full bg-sky-500/20 px-1.5 text-[10px] font-medium text-sky-700">
                {pharmacyReport.topExcessProducts.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="skt" className="gap-1.5">
            <Calendar className="h-4 w-4" /> SKT Uyarıları
            {expiry.products.length > 0 && (
              <span className="ml-1 rounded-full bg-orange-500/20 px-1.5 text-[10px] font-medium text-orange-700">
                {expiry.products.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="risk" className="gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Risk
            {risk.items.length > 0 && (
              <span className="ml-1 rounded-full bg-rose-500/20 px-1.5 text-[10px] font-medium text-rose-700">
                {risk.items.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Filtreler — risk hariç */}
        {initialTab !== "risk" && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Marka</Label>
              <Select
                value={currentFilters.brandId?.toString() ?? "_all"}
                onValueChange={changeBrand}
              >
                <SelectTrigger size="sm" className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Tüm markalar</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(initialTab === "stok" ||
              initialTab === "hareketsiz" ||
              initialTab === "cok-satan") && (
              <div className="space-y-1">
                <Label className="text-[11px]">Kategori</Label>
                <Select
                  value={currentFilters.categoryId?.toString() ?? "_all"}
                  onValueChange={changeCategory}
                >
                  <SelectTrigger size="sm" className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Tümü</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {initialTab === "hareketsiz" && (
              <div className="space-y-1">
                <Label className="text-[11px]">Periyot</Label>
                <Select
                  value={currentFilters.daysSinceMovement.toString()}
                  onValueChange={changeDays}
                >
                  <SelectTrigger size="sm" className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 gün+</SelectItem>
                    <SelectItem value="60">60 gün+</SelectItem>
                    <SelectItem value="90">90 gün+</SelectItem>
                    <SelectItem value="180">6 ay+</SelectItem>
                    <SelectItem value="9999">Hiç hareket yok</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {initialTab === "cok-satan" && (
              <div className="space-y-1">
                <Label className="text-[11px]">Periyot</Label>
                <Select
                  value={currentFilters.movePeriod.toString()}
                  onValueChange={changeMovePeriod}
                >
                  <SelectTrigger size="sm" className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Son 7 gün</SelectItem>
                    <SelectItem value="30">Son 30 gün</SelectItem>
                    <SelectItem value="60">Son 60 gün</SelectItem>
                    <SelectItem value="90">Son 90 gün</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
      </div>

      <TabsContent value="stok" className="mt-4 space-y-4">
        <StockTab summary={stockSummary} breakdown={breakdown} />
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onExport("inventory")}
            disabled={pending}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Stok Envanteri Excel (Set+Hediye Hariç)
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="cok-satan" className="mt-4 space-y-4">
        <TopMoversTab data={topMovers} />
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onExport("topmovers")}
            disabled={pending}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Excel İndir
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="hareketsiz" className="mt-4 space-y-4">
        <StaleTab data={stale} />
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onExport("stale")}
            disabled={pending}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Excel İndir (Ana Stok Bazlı)
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="eczane" className="mt-4 space-y-4">
        <PharmacyTab data={pharmacyReport} />
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onExport("pharmacy")}
            disabled={pending}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Excel İndir (Marka + Fazlalık)
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="skt" className="mt-4 space-y-4">
        <ExpiryTab data={expiry} />
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onExport("expiry")}
            disabled={pending}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Excel İndir (Özet + Detay)
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="risk" className="mt-4 space-y-4">
        <RiskTab data={risk} />
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onExport("risk")}
            disabled={pending}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Excel İndir
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  )
}
