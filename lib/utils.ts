import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * TL (Türk Lirası) formatı
 */
export function formatCurrency(
  value: number | string | null | undefined,
  opts: { decimals?: number } = {}
): string {
  const n =
    typeof value === "string" ? Number(value) : (value ?? 0)
  if (!Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: opts.decimals ?? 2,
    maximumFractionDigits: opts.decimals ?? 2,
  }).format(n)
}

export function formatNumber(
  value: number | string | null | undefined,
  decimals = 0
): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0)
  if (!Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

export function formatPercent(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0)
  if (!Number.isFinite(n)) return "—"
  return `%${new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)}`
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

/** Tarih + saat (dd.MM.yyyy HH:mm) */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}
