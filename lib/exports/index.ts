/**
 * Sistem Yedekleme — Tüm modüller için Excel export registry.
 *
 * Her modül `ExportModule` interface'ini implement eder.
 * Tek modül: GET /api/export?module=products
 * Tüm sistem ZIP: GET /api/export?module=all
 */
import * as XLSX from "xlsx"

export type WorkbookBuilder = () => Promise<XLSX.WorkBook>

export interface ExportModule {
  /** URL key (örn "products", "stock-movements") */
  key: string
  /** UI'da gösterilen ad (örn "Ürünler") */
  label: string
  /** Kategorize (örn "Operasyonel", "Finans", "Tanımlar") */
  group: string
  /** Dosya adı (uzantı hariç, örn "urunler-2026-01-15") */
  filename: string
  /** Workbook builder fonksiyonu (XLSX.WorkBook döner) */
  build: WorkbookBuilder
  /** Modül hakkında kısa açıklama (UI için) */
  description?: string
}

/** TR tarihi YYYY-MM-DD (dosya adı için) */
export function dateSlug(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10)
}

/** Workbook → Buffer (server response için) */
export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
}

/** Common sheet helper — JSON array → worksheet with column widths */
export function makeSheet<T extends Record<string, unknown>>(
  rows: T[],
  options?: { columnWidths?: number[] },
): XLSX.WorkSheet {
  const ws = XLSX.utils.json_to_sheet(rows)
  if (options?.columnWidths) {
    ws["!cols"] = options.columnWidths.map((w) => ({ wch: w }))
  }
  return ws
}

/** AOA (2D array) → worksheet — header satırı + veri satırları */
export function makeSheetFromAOA(
  rows: (string | number | null | undefined)[][],
  options?: { columnWidths?: number[] },
): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  if (options?.columnWidths) {
    ws["!cols"] = options.columnWidths.map((w) => ({ wch: w }))
  }
  return ws
}

/** Decimal/null → number/null (Prisma Decimal'ları serialize etmek için) */
export function num(v: { toString(): string } | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === "number") return v
  const n = Number(v.toString())
  return Number.isFinite(n) ? n : null
}

/** Tarih → "dd.MM.yyyy" (Excel için okunabilir) */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return ""
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

/** Tarih + saat → "dd.MM.yyyy HH:mm" */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return ""
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

// ===== Registry =====
// Tüm modüller burada register edilir. Yeni modül eklemek için:
//   1. lib/exports/<module>.ts dosyasını oluştur
//   2. buildXWorkbook export et
//   3. Aşağıdaki MODULES dizisine ekle

import { buildProductsWorkbook } from "./products"
import { buildStockMovementsWorkbook } from "./stock-movements"
import { buildSetProductsWorkbook } from "./set-products"
import { buildOrdersWorkbook } from "./orders"
import { buildCampaignsWorkbook } from "./campaigns"
import { buildBrandsWorkbook } from "./brands"
import { buildCounterpartiesWorkbook } from "./counterparties"
import { buildCategoriesWorkbook } from "./categories"
import { buildMarketplacesWorkbook } from "./marketplaces"
import { buildEmployeesWorkbook } from "./employees"
import { buildExchangesWorkbook } from "./exchanges"
import { buildPurchaseInvoicesWorkbook } from "./purchase-invoices"
import { buildIncomeExpenseWorkbook } from "./income-expense"
import { buildUsersWorkbook } from "./users"
import { buildCommissionTariffsWorkbook } from "./commission-tariffs"
import { buildTrendyolFavoritesWorkbook } from "./trendyol-favorites"
import { buildPharmacyUploadsWorkbook } from "./pharmacy-uploads"

export const MODULES: ExportModule[] = [
  // === Tanımlar ===
  {
    key: "brands",
    label: "Markalar",
    group: "Tanımlar",
    filename: "markalar",
    description: "Marka listesi + iskonto oranları (fatura altı, yıl sonu) + marj",
    build: buildBrandsWorkbook,
  },
  {
    key: "categories",
    label: "Kategoriler",
    group: "Tanımlar",
    filename: "kategoriler",
    description: "Kategori + Alt kategori ağacı",
    build: buildCategoriesWorkbook,
  },
  {
    key: "counterparties",
    label: "Cariler",
    group: "Tanımlar",
    filename: "cariler",
    description: "Eczane / distribütör / birey cari listesi",
    build: buildCounterpartiesWorkbook,
  },
  {
    key: "marketplaces",
    label: "Pazar Yerleri",
    group: "Tanımlar",
    filename: "pazaryerleri",
    description: "Marketplace ayarları (komisyon, kargo, stopaj, hedef kâr)",
    build: buildMarketplacesWorkbook,
  },
  {
    key: "employees",
    label: "Personel",
    group: "Tanımlar",
    filename: "personel",
    description: "Personel listesi (aktif + pasif)",
    build: buildEmployeesWorkbook,
  },
  {
    key: "users",
    label: "Kullanıcılar",
    group: "Tanımlar",
    filename: "kullanicilar",
    description: "Sistem kullanıcıları + modül izinleri",
    build: buildUsersWorkbook,
  },

  // === Ürünler ===
  {
    key: "products",
    label: "Ürünler",
    group: "Ürünler",
    filename: "urunler",
    description: "Tüm ürünler + barkodlar + pazaryeri listings + fiyatlar",
    build: buildProductsWorkbook,
  },
  {
    key: "set-products",
    label: "Set Ürünler",
    group: "Ürünler",
    filename: "set-urunler",
    description: "Sanal set ürünler + bileşenleri",
    build: buildSetProductsWorkbook,
  },
  {
    key: "stock-movements",
    label: "Stok Hareketleri",
    group: "Ürünler",
    filename: "stok-hareketleri",
    description: "Tüm stok hareketleri (giriş/çıkış/takas/düzeltme)",
    build: buildStockMovementsWorkbook,
  },
  {
    key: "exchanges",
    label: "Takas (Tüm)",
    group: "Ürünler",
    filename: "takas",
    description: "Bekleyen + tamamlanan + iptal edilen takaslar",
    build: buildExchangesWorkbook,
  },

  // === Operasyonel ===
  {
    key: "orders",
    label: "Siparişler (Markaya)",
    group: "Operasyonel",
    filename: "siparisler",
    description: "Markaya verilen siparişler + kalemleri",
    build: buildOrdersWorkbook,
  },
  {
    key: "campaigns",
    label: "Kampanyalar",
    group: "Operasyonel",
    filename: "kampanyalar",
    description: "Aktif + geçmiş kampanyalar + ürün eşleşmeleri",
    build: buildCampaignsWorkbook,
  },
  {
    key: "commission-tariffs",
    label: "Komisyon Tarifeleri",
    group: "Operasyonel",
    filename: "komisyon-tarifeleri",
    description: "Trendyol komisyon tarife yüklemeleri + seçimler",
    build: buildCommissionTariffsWorkbook,
  },
  {
    key: "trendyol-favorites",
    label: "Trendyol Favori Snapshot'ları",
    group: "Operasyonel",
    filename: "trendyol-favorileri",
    description: "Trendyol favori/görüntülenme snapshot'ları",
    build: buildTrendyolFavoritesWorkbook,
  },
  {
    key: "pharmacy-uploads",
    label: "Eczane Yüklemeleri",
    group: "Operasyonel",
    filename: "eczane-yuklemeler",
    description: "Eczane Excel yükleme geçmişi",
    build: buildPharmacyUploadsWorkbook,
  },

  // === Finans ===
  {
    key: "purchase-invoices",
    label: "Alış Faturaları",
    group: "Finans",
    filename: "alis-faturalari",
    description: "Eczaneden gelen faturalar + iskonto alacağı + tahsilatlar",
    build: buildPurchaseInvoicesWorkbook,
  },
  {
    key: "income-expense",
    label: "Gelir / Gider",
    group: "Finans",
    filename: "gelir-gider",
    description: "Operasyonel giderler + aylık snapshot + pivot",
    build: buildIncomeExpenseWorkbook,
  },
]

export function findModule(key: string): ExportModule | undefined {
  return MODULES.find((m) => m.key === key)
}

/** UI için: gruplara göre listele */
export function getModulesByGroup(): Record<string, ExportModule[]> {
  const groups: Record<string, ExportModule[]> = {}
  for (const m of MODULES) {
    if (!groups[m.group]) groups[m.group] = []
    groups[m.group].push(m)
  }
  return groups
}
