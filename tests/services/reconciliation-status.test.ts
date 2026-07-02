import { describe, it, expect } from "vitest"
import { isReconOrderStatusPending } from "@/lib/services/reconciliation-status"

describe("isReconOrderStatusPending", () => {
  it("Trendyol: sadece 'Yeni Sipariş' kesinleşmemiş sayılır", () => {
    expect(isReconOrderStatusPending("trendyol", "Yeni Sipariş")).toBe(true)
    expect(isReconOrderStatusPending("trendyol", "Teslim Edildi")).toBe(false)
    expect(isReconOrderStatusPending("trendyol", "İptal Edildi")).toBe(false)
    expect(isReconOrderStatusPending("trendyol", "İade Edildi")).toBe(false)
  })

  it("Hepsiburada: sadece 'Teslim edilecek' kesinleşmemiş sayılır", () => {
    expect(isReconOrderStatusPending("hepsiburada", "Teslim edilecek")).toBe(true)
    expect(isReconOrderStatusPending("hepsiburada", "Teslim edildi")).toBe(false)
    expect(isReconOrderStatusPending("hepsiburada", "İptal edildi")).toBe(false)
  })

  it("N11: 'Tamamlandı' dışındaki her statü ihtiyatlı şekilde kesinleşmemiş sayılır", () => {
    expect(isReconOrderStatusPending("n11", "Tamamlandı")).toBe(false)
    expect(isReconOrderStatusPending("n11", "Hazırlanıyor")).toBe(true)
    expect(isReconOrderStatusPending("n11", "Bilinmeyen Statü")).toBe(true)
  })

  it("Farmazon veya tanımsız kanal: her zaman false (sinyal yok)", () => {
    expect(isReconOrderStatusPending("farmazon", "her hangi bir şey")).toBe(false)
    expect(isReconOrderStatusPending("bilinmeyen-pazaryeri", "Yeni Sipariş")).toBe(false)
  })

  it("null/undefined orderStatus → false (bilinmiyor, uyarma)", () => {
    expect(isReconOrderStatusPending("trendyol", null)).toBe(false)
    expect(isReconOrderStatusPending("trendyol", undefined)).toBe(false)
  })

  it("büyük/küçük harf duyarsız kanal eşleşmesi", () => {
    expect(isReconOrderStatusPending("Trendyol", "Yeni Sipariş")).toBe(true)
    expect(isReconOrderStatusPending("HEPSIBURADA", "Teslim edilecek")).toBe(true)
  })
})
