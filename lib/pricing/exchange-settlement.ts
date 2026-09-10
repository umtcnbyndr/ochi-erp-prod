/**
 * Takas Kapatma — saf hesap.
 *
 * Kullanıcı kararı 2026-09-10:
 *  - Denklik PSF değil **ALIŞ MALİYETİ** üzerinden. Kaybettiğimiz şey rafiyat değil,
 *    malın bize maliyeti.
 *  - Tam denk gelmesi beklenmez; fark nota yazılıp kapatılır. **Bakiye takibi YOK**
 *    (sistem sade kalsın — kullanıcı zaten karşı tarafla anlaşıyor).
 *  - Kısmi kapatmaya kullanıcı karar verir: her verilen kalemde "kaç adet kapansın"
 *    seçilir, varsayılan tamamı.
 *
 * Bu dosya DB'ye dokunmaz — sadece toplamları ve farkı hesaplar.
 */
import { round4, toNumber, type NumericInput } from "./utils"

/** Kapatılacak "verilen" kalem — maliyeti kapatma anında dışarıdan verilir. */
export interface SettlementGivenLine {
  exchangeId: number
  /** Kaydın toplam adedi (kısmi kapatmada üst sınır) */
  totalQuantity: number
  /** Bu kapatmada kapanacak adet (1..totalQuantity) */
  settleQuantity: number
  /** Birim maliyet — resolveProductUnitCost sonucu ya da kayda mühürlenmiş fiyat */
  unitCost: NumericInput
}

/** Karşılık gelen ürün — alış fiyatı kullanıcı tarafından elle girilir. */
export interface SettlementReceivedLine {
  productId: number
  quantity: number
  /** Elle girilen alış fiyatı (KDV dahil) */
  unitPrice: NumericInput
}

export interface SettlementTotals {
  givenCost: number
  receivedCost: number
  /** givenCost - receivedCost. Pozitif = bize borç kaldı, negatif = fazla geldi. */
  difference: number
  givenQuantity: number
  receivedQuantity: number
}

export class InvalidSettlementError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidSettlementError"
  }
}

/**
 * Kapatma toplamlarını hesaplar. Geçersiz girdide anlaşılır hata fırlatır —
 * sessizce 0'a düşmez (para-kritik: yanlış kapatma stok ve alış fiyatını bozar).
 */
export function calculateSettlement(
  given: SettlementGivenLine[],
  received: SettlementReceivedLine[],
): SettlementTotals {
  if (given.length === 0) {
    throw new InvalidSettlementError("En az bir 'verilen' kalem seçilmeli")
  }

  let givenCost = 0
  let givenQuantity = 0
  for (const g of given) {
    if (!Number.isInteger(g.settleQuantity) || g.settleQuantity <= 0) {
      throw new InvalidSettlementError(
        `Kapatılacak adet pozitif tam sayı olmalı (kayıt ${g.exchangeId})`,
      )
    }
    if (g.settleQuantity > g.totalQuantity) {
      throw new InvalidSettlementError(
        `Kapatılacak adet kayıttaki adetten fazla olamaz (kayıt ${g.exchangeId}: ${g.settleQuantity} > ${g.totalQuantity})`,
      )
    }
    const cost = toNumber(g.unitCost, NaN)
    if (!Number.isFinite(cost) || cost < 0) {
      throw new InvalidSettlementError(
        `Birim maliyet okunamadı (kayıt ${g.exchangeId}) — ürünün alış fiyatı girilmeli`,
      )
    }
    givenCost += cost * g.settleQuantity
    givenQuantity += g.settleQuantity
  }

  let receivedCost = 0
  let receivedQuantity = 0
  for (const r of received) {
    if (!Number.isInteger(r.quantity) || r.quantity <= 0) {
      throw new InvalidSettlementError("Gelen ürün adedi pozitif tam sayı olmalı")
    }
    const price = toNumber(r.unitPrice, NaN)
    if (!Number.isFinite(price) || price < 0) {
      throw new InvalidSettlementError("Gelen ürünün alış fiyatı girilmeli")
    }
    receivedCost += price * r.quantity
    receivedQuantity += r.quantity
  }

  return {
    givenCost: round4(givenCost),
    receivedCost: round4(receivedCost),
    difference: round4(givenCost - receivedCost),
    givenQuantity,
    receivedQuantity,
  }
}

/** Kapatma notuna otomatik eklenen fark özeti (kullanıcı notunun önüne yazılır). */
export function formatSettlementNote(totals: SettlementTotals, userNote?: string | null): string {
  const tl = (n: number) =>
    n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const diff = totals.difference
  const farkText =
    Math.abs(diff) < 0.01
      ? "tam denk"
      : diff > 0
        ? `fark ${tl(diff)} ₺ bizim lehimize açık kaldı`
        : `fark ${tl(Math.abs(diff))} ₺ fazla geldi`
  const base = `Verilen ${tl(totals.givenCost)} ₺ · Gelen ${tl(totals.receivedCost)} ₺ · ${farkText}`
  return userNote && userNote.trim() ? `${base} — ${userNote.trim()}` : base
}
