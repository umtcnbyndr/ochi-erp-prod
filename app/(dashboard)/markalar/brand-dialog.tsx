"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
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

interface BrandInitialData {
  id?: number
  name?: string
  invoiceDiscount1?: number | string
  invoiceDiscount2?: number | string
  invoiceDiscount3?: number | string
  yearEndDiscount1?: number | string
  yearEndDiscount2?: number | string
  yearEndDiscount3?: number | string
  pharmacyMargin?: number | string
  pharmacyStockRule?: number
  distributorInfo?: string | null
  contactInfo?: string | null
}

interface BrandDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: BrandInitialData
}

export function BrandDialog({ open, onOpenChange, initialData }: BrandDialogProps) {
  const [pending, startTransition] = useTransition()
  const isEdit = Boolean(initialData?.id)

  function onSubmit(formData: FormData) {
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
            </div>
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
            <Label htmlFor="contactInfo">İletişim</Label>
            <Textarea
              id="contactInfo"
              name="contactInfo"
              rows={2}
              defaultValue={initialData?.contactInfo ?? ""}
              placeholder="Marka satıcı telefon, e-posta"
            />
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
