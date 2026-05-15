/**
 * Dopigo Stok Uyarıları — bizim efektif stok ile Dopigo depot stoğunu kıyaslar.
 *
 * (Adlandırma not: lib/services/stock-alerts.ts farklı bir konuya hizmet ediyor
 *  — satış hızına göre tükeniş uyarısı. Bu dosya Dopigo senkron uyarısı.)
 *
 * Durum mantığı:
 *   sistem = calculateEffectiveStock(p)  (mainStock + cadde'den açılabilir miktar)
 *   dopigo  = Dopigo API `stock` (depot, biz push edersek set ediyoruz)
 *
 *   CRITICAL   sistem = 0 && dopigo > 0      → derhal kapatılmalı
 *   RISKY      sistem < dopigo (≥ 2 fark)    → overselling riski
 *   MISSED     sistem > dopigo (≥ 2 fark)    → kaçırılan satış
 *   MINOR      sistem ≠ dopigo (1 fark)
 *   OK         sistem = dopigo               → tutarlı
 *   UNMATCHED  ürün Dopigo'da bulunamadı     → mapping eksiği
 */
import { prisma } from "@/lib/db"
import { calculateEffectiveStock } from "./dopigo-sync"
import { buildDopigoStockMap } from "./dopigo-api/products"

export type DopigoAlertStatus =
  | "CRITICAL"
  | "RISKY"
  | "MISSED"
  | "MINOR"
  | "OK"
  | "UNMATCHED"

export interface DopigoStockAlertRow {
  productId: number
  barcode: string
  name: string
  brandName: string
  mainStock: number
  streetStock: number
  systemStock: number
  systemSource: "MAIN" | "PHARMACY_FALLBACK" | "ZERO" | "SET_VIRTUAL"
  dopigoStock: number | null
  dopigoAvailable: number | null
  diff: number // sistem - dopigo
  status: DopigoAlertStatus
  /** Push edilirse hangi değer gidecek */
  pushValue: number
}

export interface DopigoStockAlertReport {
  generatedAt: Date
  totals: Record<DopigoAlertStatus, number>
  rows: DopigoStockAlertRow[]
}

const MINOR_THRESHOLD = 1

export async function buildDopigoStockAlertReport(options?: {
  brandIds?: number[]
  /** OK durumdakileri raporlama (default true — kalabalık olmasın) */
  excludeOk?: boolean
}): Promise<DopigoStockAlertReport> {
  const excludeOk = options?.excludeOk ?? true

  const products = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      productType: "SINGLE",
      ...(options?.brandIds && options.brandIds.length > 0
        ? { brandId: { in: options.brandIds } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      productType: true,
      mainStock: true,
      streetStock: true,
      brand: {
        select: { id: true, name: true, pharmacyStockRule: true, pharmacyOpenAmount: true },
      },
      setComponents: {
        select: { quantity: true, component: { select: { mainStock: true } } },
      },
    },
  })

  const dopigoMap = await buildDopigoStockMap()

  const totals: Record<DopigoAlertStatus, number> = {
    CRITICAL: 0,
    RISKY: 0,
    MISSED: 0,
    MINOR: 0,
    OK: 0,
    UNMATCHED: 0,
  }
  const rows: DopigoStockAlertRow[] = []

  for (const p of products) {
    const effective = calculateEffectiveStock({
      productType: p.productType,
      mainStock: p.mainStock,
      streetStock: p.streetStock,
      brand: {
        pharmacyStockRule: p.brand?.pharmacyStockRule ?? 0,
        pharmacyOpenAmount: p.brand?.pharmacyOpenAmount ?? null,
      },
      setComponents: p.setComponents.map((sc) => ({
        quantity: sc.quantity,
        component: { mainStock: sc.component.mainStock },
      })),
    })

    const dop = dopigoMap.get(p.primaryBarcode)

    let status: DopigoAlertStatus
    let diff = 0
    if (!dop) {
      status = "UNMATCHED"
    } else {
      diff = effective.stock - dop.stock
      if (effective.stock === 0 && dop.stock > 0) status = "CRITICAL"
      else if (Math.abs(diff) <= MINOR_THRESHOLD && diff !== 0) status = "MINOR"
      else if (diff === 0) status = "OK"
      else if (diff < 0) status = "RISKY"
      else status = "MISSED"
    }

    totals[status]++

    if (excludeOk && status === "OK") continue

    rows.push({
      productId: p.id,
      barcode: p.primaryBarcode,
      name: p.name,
      brandName: p.brand?.name ?? "—",
      mainStock: p.mainStock,
      streetStock: p.streetStock,
      systemStock: effective.stock,
      systemSource: effective.source,
      dopigoStock: dop?.stock ?? null,
      dopigoAvailable: dop?.availableStock ?? null,
      diff,
      status,
      pushValue: effective.stock,
    })
  }

  const order: Record<DopigoAlertStatus, number> = {
    CRITICAL: 0,
    RISKY: 1,
    MISSED: 2,
    MINOR: 3,
    UNMATCHED: 4,
    OK: 5,
  }
  rows.sort((a, b) => {
    const o = order[a.status] - order[b.status]
    if (o !== 0) return o
    return Math.abs(b.diff) - Math.abs(a.diff)
  })

  return { generatedAt: new Date(), totals, rows }
}
