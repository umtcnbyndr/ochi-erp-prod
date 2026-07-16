import { describe, it, expect } from "vitest"
import { MARKETPLACE_PARSERS } from "@/lib/services/marketplace-reconciliation"
import { SPLIT_MATCH_CHANNELS, reconMatchKeySql } from "@/lib/services/reconciliation-status"

/**
 * Mutabakat eşleşme anahtarı iki yerde uygulanır: TS (parser matchKey) ve SQL
 * (sales-analytics recon join'leri). Bu test ikisinin SENKRON kaldığını kilitler —
 * biri değişip diğeri unutulursa sipariş tablosu/raporlar o kanalda sessizce
 * tahmine düşer (2026-07-16'da Hepsiburada+N11'de yaşandı: import 37/37 eşleşti
 * ama analytics 0 buldu, çünkü SQL sadece trendyol için ilk parçayı alıyordu).
 */
describe("recon match key — TS parser ve SQL senkronu", () => {
  it("registry'deki her parser'ın matchKey davranışı SPLIT_MATCH_CHANNELS ile tutarlı", () => {
    for (const [name, parser] of Object.entries(MARKETPLACE_PARSERS)) {
      const splits = parser.matchKey("AAA-BBB") === "AAA"
      const inList = (SPLIT_MATCH_CHANNELS as readonly string[]).includes(parser.salesChannel)
      expect(splits, `${name} (${parser.salesChannel}): matchKey ile SPLIT_MATCH_CHANNELS uyumsuz`).toBe(inList)
    }
  })

  it("trendyol registry'de yok ama çoklu-paket kuralı gereği listede", () => {
    expect(SPLIT_MATCH_CHANNELS).toContain("trendyol")
  })

  it("farmazon serviceValue birebir eşleşir (listede değil)", () => {
    expect(SPLIT_MATCH_CHANNELS).not.toContain("farmazon")
    expect(MARKETPLACE_PARSERS.Farmazon.matchKey("AAA-BBB")).toBe("AAA-BBB")
  })

  it("SQL fragment listedeki her kanalı ve SPLIT_PART'ı içerir, default tam serviceValue", () => {
    const sql = reconMatchKeySql("o")
    for (const c of SPLIT_MATCH_CHANNELS) expect(sql).toContain(`'${c}'`)
    expect(sql).toContain(`SPLIT_PART(o."serviceValue", '-', 1)`)
    expect(sql).toMatch(/ELSE o\."serviceValue" END/)
  })

  it("SQL fragment alias parametresini uygular", () => {
    const sql = reconMatchKeySql("ord")
    expect(sql).toContain(`ord."salesChannel"`)
    expect(sql).toContain(`SPLIT_PART(ord."serviceValue", '-', 1)`)
  })
})
