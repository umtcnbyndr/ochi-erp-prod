"use client"

import { useState, useTransition } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createBrand, updateBrand } from "./actions"

export interface BrandContactData {
  name: string
  email?: string | null
  phone?: string | null
  note?: string | null
}

interface BrandInitialData {
  id?: number
  name?: string
  aliases?: string[]
  invoiceDiscount1?: number | string
  invoiceDiscount2?: number | string
  invoiceDiscount3?: number | string
  yearEndDiscount1?: number | string
  yearEndDiscount2?: number | string
  yearEndDiscount3?: number | string
  pharmacyMargin?: number | string
  pharmacyStockRule?: number
  pharmacyOpenAmount?: number | null
  targetProfit?: number | string | null
  priceUndercutBuffer?: number | string
  priceUndercutBufferPct?: number | string
  distributorInfo?: string | null
  contacts?: BrandContactData[]
}

let contactRowSeq = 0
function newContactRow(): BrandContactData & { rowId: number } {
  contactRowSeq += 1
  return { rowId: contactRowSeq, name: "", email: "", phone: "", note: "" }
}

interface BrandDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: BrandInitialData
}

export function BrandDialog({ open, onOpenChange, initialData }: BrandDialogProps) {
  const [pending, startTransition] = useTransition()
  const isEdit = Boolean(initialData?.id)
  const [contacts, setContacts] = useState<Array<BrandContactData & { rowId: number }>>(() => {
    const initial = initialData?.contacts ?? []
    return initial.length > 0
      ? initial.map((c) => ({ ...c, rowId: ++contactRowSeq }))
      : [newContactRow()]
  })

  function updateContact(rowId: number, field: keyof BrandContactData, value: string) {
    setContacts((rows) => rows.map((r) => (r.rowId === rowId ? { ...r, [field]: value } : r)))
  }

  function addContactRow() {
    setContacts((rows) => [...rows, newContactRow()])
  }

  function removeContactRow(rowId: number) {
    setContacts((rows) => rows.filter((r) => r.rowId !== rowId))
  }

  function onSubmit(formData: FormData) {
    const cleanContacts = contacts
      .filter((c) => c.name.trim().length > 0)
      .map(({ name, email, phone, note }) => ({ name, email, phone, note }))
    formData.set("contacts", JSON.stringify(cleanContacts))

    startTransition(async () => {
      const result = isEdit && initialData?.id
        ? await updateBrand(initialData.id, formData)
        : await createBrand(formData)

      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(isEdit ? "Marka güncellendi" : "Marka eklendi")
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Marka Düzenle" : "Yeni Marka"}</DialogTitle>
          <DialogDescription>
            Marka bilgileri, iskontolar ve eczane stok kuralı
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Marka Adı</Label>
            <Input
              id="name"
              name="name"
              defaultValue={initialData?.name ?? ""}
              required
              placeholder="Örn: Caudalie"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="aliases">Eski isimler / Alternatif yazımlar</Label>
            <Textarea
              id="aliases"
              name="aliases"
              rows={2}
              defaultValue={(initialData?.aliases ?? []).join(", ")}
              placeholder="Virgülle ayırın — örn: CAUDALIE, Caudalie Fransa"
              className="resize-none text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Excel yüklemesinde bu isimlerle gelen satırlar da bu markaya bağlanır. İsmi değiştirirsen eski isim otomatik buraya eklenir.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Fatura Altı İskontolar (%)</h3>
            <div className="grid grid-cols-3 gap-3">
              <PercentField name="invoiceDiscount1" label="1" defaultValue={initialData?.invoiceDiscount1} />
              <PercentField name="invoiceDiscount2" label="2" defaultValue={initialData?.invoiceDiscount2} />
              <PercentField name="invoiceDiscount3" label="3" defaultValue={initialData?.invoiceDiscount3} />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Yıl Sonu İskontoları (%)</h3>
            <div className="grid grid-cols-3 gap-3">
              <PercentField name="yearEndDiscount1" label="1" defaultValue={initialData?.yearEndDiscount1} />
              <PercentField name="yearEndDiscount2" label="2" defaultValue={initialData?.yearEndDiscount2} />
              <PercentField name="yearEndDiscount3" label="3" defaultValue={initialData?.yearEndDiscount3} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pharmacyMargin">Eczane Kar Marjı (%)</Label>
              <Input
                id="pharmacyMargin"
                name="pharmacyMargin"
                type="number"
                step="0.01"
                min="0"
                max="100"
                defaultValue={Number(initialData?.pharmacyMargin ?? 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pharmacyStockRule">
                Eczane Stok Kuralı (adet)
              </Label>
              <Input
                id="pharmacyStockRule"
                name="pharmacyStockRule"
                type="number"
                step="1"
                min="0"
                defaultValue={initialData?.pharmacyStockRule ?? 0}
              />
              <p className="text-[11px] text-muted-foreground">
                Eczane'de bu sayının altına düşmesin (koruma).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pharmacyOpenAmount">
                Açılacak Maks. Adet (opsiyonel)
              </Label>
              <Input
                id="pharmacyOpenAmount"
                name="pharmacyOpenAmount"
                type="number"
                step="1"
                min="0"
                placeholder="Boş = tümünü aç"
                defaultValue={initialData?.pharmacyOpenAmount ?? ""}
              />
              <p className="text-[11px] text-muted-foreground">
                Boş: kural üstündeki <strong>tüm</strong> stok açılır (mevcut).<br />
                Sayı: kural üstünden <strong>en çok bu kadar</strong> aç (örn 1 → tek tek).
              </p>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border bg-blue-500/5 p-3">
            <p className="text-sm font-semibold text-blue-700">
              Pazaryeri Hedef Kar Marjı (opsiyonel)
            </p>
            <div className="space-y-1">
              <Label htmlFor="targetProfit" className="text-xs">
                Hedef Kar (%)
              </Label>
              <Input
                id="targetProfit"
                name="targetProfit"
                type="number"
                step="0.01"
                min="0"
                max="99"
                defaultValue={
                  initialData?.targetProfit != null
                    ? Number(initialData.targetProfit)
                    : ""
                }
                placeholder="Boş bırakılırsa marketplace değeri kullanılır"
              />
              <p className="text-[11px] text-muted-foreground">
                Doluysa <strong>tüm pazar yerlerinde</strong> bu marka için marketplace
                hedef karını <strong>ezer</strong>. Boş bırakılırsa marketplace&apos;in
                kendi hedef karı kullanılır. <em>Eczane Kar Marjı ile karıştırılmamalı —
                bu pazaryeri satış fiyatı için.</em>
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border bg-amber-500/5 p-3">
            <p className="text-sm font-semibold text-amber-700">
              BuyBox Tampon — Rakibin Altına Ne Kadar İnecek
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="priceUndercutBufferPct" className="text-xs">
                  Yüzde Tampon (%) — önerilen
                </Label>
                <Input
                  id="priceUndercutBufferPct"
                  name="priceUndercutBufferPct"
                  type="number"
                  step="0.1"
                  min="0"
                  max="50"
                  defaultValue={Number(initialData?.priceUndercutBufferPct ?? 0)}
                  placeholder="5"
                />
                <p className="text-[11px] text-muted-foreground">
                  Orantılı: BuyBox 1000 → 950, BuyBox 5000 → 4750
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="priceUndercutBuffer" className="text-xs">
                  TL Tampon (sabit) — fallback
                </Label>
                <Input
                  id="priceUndercutBuffer"
                  name="priceUndercutBuffer"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={Number(initialData?.priceUndercutBuffer ?? 0)}
                  placeholder="0"
                />
                <p className="text-[11px] text-muted-foreground">
                  Sabit: BuyBox − bu değer (% varsa atlanır)
                </p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Yüzde &gt; TL &gt; Pazaryeri default. <strong>%5 önerilir</strong> — orantılı
              koruma. BuyBox 1000 ise 950, BuyBox 5000 (rakip yanılsa bile) 4750 — agresif
              ama orantılı.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="distributorInfo">Distribütör Bilgisi</Label>
            <Textarea
              id="distributorInfo"
              name="distributorInfo"
              rows={2}
              defaultValue={initialData?.distributorInfo ?? ""}
              placeholder="Distribütör firma adı, iletişim"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>İletişim Kişileri</Label>
              <Button type="button" variant="outline" size="sm" onClick={addContactRow}>
                <Plus className="h-3.5 w-3.5" />
                Kişi Ekle
              </Button>
            </div>
            <div className="space-y-2">
              {contacts.map((c) => (
                <div
                  key={c.rowId}
                  className="grid grid-cols-1 gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
                >
                  <Input
                    placeholder="İsim"
                    value={c.name}
                    onChange={(e) => updateContact(c.rowId, "name", e.target.value)}
                  />
                  <Input
                    type="email"
                    placeholder="E-posta"
                    value={c.email ?? ""}
                    onChange={(e) => updateContact(c.rowId, "email", e.target.value)}
                  />
                  <Input
                    placeholder="Telefon"
                    value={c.phone ?? ""}
                    onChange={(e) => updateContact(c.rowId, "phone", e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeContactRow(c.rowId)}
                    aria-label="Kişiyi sil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Textarea
                    className="resize-none text-sm sm:col-span-4"
                    rows={1}
                    placeholder="Not (opsiyonel)"
                    value={c.note ?? ""}
                    onChange={(e) => updateContact(c.rowId, "note", e.target.value)}
                  />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Satıcı/marka temsilcisi iletişim kişileri — birden fazla eklenebilir.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              İptal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Kaydet" : "Ekle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PercentField({
  name,
  label,
  defaultValue,
}: {
  name: string
  label: string
  defaultValue?: number | string
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={name}
        name={name}
        type="number"
        step="0.01"
        min="0"
        max="100"
        defaultValue={Number(defaultValue ?? 0)}
        placeholder="0"
      />
    </div>
  )
}
