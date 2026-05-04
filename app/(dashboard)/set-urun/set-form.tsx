"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Loader2, Trash2, Package, Info } from "lucide-react"
import {
  setProductSchema,
  type SetProductFormValues,
} from "@/lib/validators/set-product"
import { createSet, updateSet } from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCurrency } from "@/lib/utils"
import { ComponentPicker } from "./component-picker"

interface ComponentRow {
  componentId: number
  quantity: number
  // UI-only fields (bileşen bilgisi - preview için)
  name: string
  primaryBarcode: string
  mainStock: number
  mainPurchasePrice: number | null
  psf: number | null
}

interface InitialData {
  id: number
  name: string
  primaryBarcode: string
  setSku: string | null
  trendyolBarcode: string | null
  dopigoBarcode: string | null
  dopigoSku: string | null
  brandId: number | null
  categoryId: number | null
  subcategoryId: number | null
  vatRate: string
  setExtraDiscount: string | null
  psf: string | null
  manufacturer: string | null
  shelf: string | null
  notes: string | null
  status: string
  components: ComponentRow[]
}

interface SetFormProps {
  brands: { id: number; name: string }[]
  categories: {
    id: number
    name: string
    subcategories: { id: number; name: string }[]
  }[]
  initialData?: InitialData
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-xs text-destructive">{message}</p>
}

export function SetForm({ brands, categories, initialData }: SetFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const isEdit = Boolean(initialData)

  // Kullanıcı PSF alanına manuel girdi mi? Edit modda initialData.psf varsa "dokunulmuş" sayılır.
  const psfTouchedRef = useRef<boolean>(Boolean(initialData?.psf))

  // Bileşen meta bilgisini UI'da tut (form state'ten ayrı)
  const [componentsMeta, setComponentsMeta] = useState<
    Record<number, Omit<ComponentRow, "componentId" | "quantity">>
  >(
    initialData
      ? Object.fromEntries(
          initialData.components.map((c) => [
            c.componentId,
            {
              name: c.name,
              primaryBarcode: c.primaryBarcode,
              mainStock: c.mainStock,
              mainPurchasePrice: c.mainPurchasePrice,
              psf: c.psf,
            },
          ])
        )
      : {}
  )

  const form = useForm<SetProductFormValues>({
    resolver: zodResolver(setProductSchema),
    defaultValues: initialData
      ? ({
          name: initialData.name,
          primaryBarcode: initialData.primaryBarcode,
          setSku: initialData.setSku,
          trendyolBarcode: initialData.trendyolBarcode ?? null,
          dopigoBarcode: initialData.dopigoBarcode ?? null,
          dopigoSku: initialData.dopigoSku ?? null,
          brandId: initialData.brandId ?? undefined,
          categoryId: initialData.categoryId ?? undefined,
          subcategoryId: initialData.subcategoryId ?? null,
          vatRate: Number(initialData.vatRate),
          setExtraDiscount: initialData.setExtraDiscount
            ? Number(initialData.setExtraDiscount)
            : null,
          psf: initialData.psf ? Number(initialData.psf) : null,
          manufacturer: initialData.manufacturer ?? null,
          shelf: initialData.shelf ?? null,
          notes: initialData.notes ?? null,
          status: initialData.status as "ACTIVE" | "PASSIVE",
          components: initialData.components.map((c) => ({
            componentId: c.componentId,
            quantity: c.quantity,
          })),
        } as SetProductFormValues)
      : ({
          name: "",
          primaryBarcode: "",
          setSku: null,
          trendyolBarcode: null,
          dopigoBarcode: null,
          dopigoSku: null,
          vatRate: 20,
          setExtraDiscount: null,
          psf: null,
          status: "ACTIVE",
          components: [],
        } as unknown as SetProductFormValues),
  })

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = form

  const { fields, append, remove } = useFieldArray({
    control,
    name: "components",
  })

  const categoryId = watch("categoryId")
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === Number(categoryId)),
    [categories, categoryId]
  )

  const componentsWatch = watch("components") ?? []
  const extraDiscount = Number(watch("setExtraDiscount") ?? 0) || 0

  // Canlı önizleme - alış, sanal stok, PSF toplamı
  const preview = useMemo(() => {
    let totalPrice = 0
    let totalPsf = 0
    let psfCount = 0
    let minStock = Number.POSITIVE_INFINITY
    let missing = false
    for (const row of componentsWatch) {
      const meta = componentsMeta[row.componentId]
      if (!meta) {
        missing = true
        continue
      }
      const qty = Math.max(1, Math.floor(row.quantity || 1))
      const price = meta.mainPurchasePrice ?? 0
      if (meta.mainPurchasePrice == null) missing = true
      totalPrice += price * qty
      if (meta.psf != null) {
        totalPsf += meta.psf * qty
        psfCount += 1
      }
      minStock = Math.min(minStock, Math.floor(meta.mainStock / qty))
    }
    const finalPrice = Math.max(0, totalPrice - extraDiscount)
    return {
      purchasePrice: finalPrice,
      availableStock: componentsWatch.length === 0 ? 0 : minStock,
      missingPrice: missing,
      psfSum: psfCount > 0 ? totalPsf : null,
      psfAllPresent: psfCount === componentsWatch.length && componentsWatch.length > 0,
    }
  }, [componentsWatch, componentsMeta, extraDiscount])

  const pickedIds = useMemo(
    () => componentsWatch.map((c) => Number(c.componentId)).filter(Boolean),
    [componentsWatch]
  )

  // Otomatik PSF — kullanıcı manuel değer girmediği sürece bileşen PSF toplamını yaz
  useEffect(() => {
    if (psfTouchedRef.current) return
    if (preview.psfSum == null || preview.psfSum <= 0) {
      setValue("psf", null, { shouldDirty: false })
      return
    }
    setValue("psf", Number(preview.psfSum.toFixed(2)), { shouldDirty: false })
  }, [preview.psfSum, setValue])

  function handlePickComponent(c: {
    id: number
    name: string
    primaryBarcode: string
    mainStock: number
    mainPurchasePrice: string | null
    psf: string | null
  }) {
    setComponentsMeta((prev) => ({
      ...prev,
      [c.id]: {
        name: c.name,
        primaryBarcode: c.primaryBarcode,
        mainStock: c.mainStock,
        mainPurchasePrice: c.mainPurchasePrice ? Number(c.mainPurchasePrice) : null,
        psf: c.psf ? Number(c.psf) : null,
      },
    }))
    append({ componentId: c.id, quantity: 1 })
  }

  function onSubmit(data: SetProductFormValues) {
    startTransition(async () => {
      if (isEdit) {
        const res = await updateSet(initialData!.id, data)
        if (!res.success) {
          toast.error(res.error)
          return
        }
        toast.success("Set güncellendi")
        router.push(`/set-urun/${initialData!.id}`)
        router.refresh()
        return
      }

      const res = await createSet(data)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success("Set oluşturuldu")
      const newId = res.data?.id
      router.push(newId ? `/set-urun/${newId}` : "/set-urun")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
        {/* SOL: form alanları */}
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="text-base font-semibold">Temel Bilgiler</h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="name">Set Adı *</Label>
                  <Input
                    id="name"
                    {...register("name")}
                    placeholder="ör. Skinceuticals Kış Bakım Seti"
                  />
                  <FieldError message={errors.name?.message} />
                </div>

                <div>
                  <Label htmlFor="primaryBarcode">Set Barkodu *</Label>
                  <Input
                    id="primaryBarcode"
                    {...register("primaryBarcode")}
                    placeholder="Tek bir barkod"
                    className="tabular-nums"
                  />
                  <FieldError message={errors.primaryBarcode?.message} />
                </div>

                <div>
                  <Label htmlFor="setSku">Set SKU</Label>
                  <Input
                    id="setSku"
                    {...register("setSku")}
                    placeholder="opsiyonel, benzersiz"
                  />
                  <FieldError message={errors.setSku?.message} />
                </div>

                <div className="sm:col-span-2 border-t pt-4 mt-2">
                  <h3 className="text-sm font-semibold mb-1">Pazaryeri Kodları</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Set ürününün Trendyol ve Dopigo'daki karşılığı (opsiyonel).
                  </p>
                </div>

                <div>
                  <Label htmlFor="trendyolBarcode">Trendyol Barkod</Label>
                  <Input
                    id="trendyolBarcode"
                    {...register("trendyolBarcode")}
                    placeholder="Örn: 3337875917919"
                    className="font-mono text-sm"
                  />
                  <FieldError message={errors.trendyolBarcode?.message} />
                </div>

                <div>
                  <Label htmlFor="dopigoBarcode">Dopigo Tedarikçi Barkod</Label>
                  <Input
                    id="dopigoBarcode"
                    {...register("dopigoBarcode")}
                    placeholder="Örn: 3337875917919"
                    className="font-mono text-sm"
                  />
                  <FieldError message={errors.dopigoBarcode?.message} />
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor="dopigoSku">Dopigo Ürün Kodu</Label>
                  <Input
                    id="dopigoSku"
                    {...register("dopigoSku")}
                    placeholder="Örn: SKN-CTCLS-G-NTR-3"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Dopigo'nun internal SKU'su (opsiyonel).
                  </p>
                  <FieldError message={errors.dopigoSku?.message} />
                </div>

                <div className="sm:col-span-2 border-t pt-2 mt-2" />

                <div>
                  <Label htmlFor="brandId">Marka *</Label>
                  <Select
                    value={watch("brandId")?.toString() ?? ""}
                    onValueChange={(v) => setValue("brandId", Number(v))}
                  >
                    <SelectTrigger id="brandId">
                      <SelectValue placeholder="Marka seç" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={errors.brandId?.message} />
                </div>

                <div>
                  <Label htmlFor="categoryId">Kategori *</Label>
                  <Select
                    value={watch("categoryId")?.toString() ?? ""}
                    onValueChange={(v) => {
                      setValue("categoryId", Number(v))
                      setValue("subcategoryId", null)
                    }}
                  >
                    <SelectTrigger id="categoryId">
                      <SelectValue placeholder="Kategori seç" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={errors.categoryId?.message} />
                </div>

                <div>
                  <Label htmlFor="subcategoryId">Alt Kategori</Label>
                  <Select
                    value={watch("subcategoryId")?.toString() ?? ""}
                    onValueChange={(v) =>
                      setValue("subcategoryId", v ? Number(v) : null)
                    }
                    disabled={!selectedCategory}
                  >
                    <SelectTrigger id="subcategoryId">
                      <SelectValue
                        placeholder={selectedCategory ? "Seç" : "Önce kategori"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedCategory?.subcategories.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="vatRate">KDV (%) *</Label>
                  <Select
                    value={watch("vatRate")?.toString() ?? "20"}
                    onValueChange={(v) => setValue("vatRate", Number(v))}
                  >
                    <SelectTrigger id="vatRate">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">%1</SelectItem>
                      <SelectItem value="10">%10</SelectItem>
                      <SelectItem value="20">%20</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="status">Durum</Label>
                  <Select
                    value={watch("status") ?? "ACTIVE"}
                    onValueChange={(v) =>
                      setValue("status", v as "ACTIVE" | "PASSIVE")
                    }
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Aktif</SelectItem>
                      <SelectItem value="PASSIVE">Pasif</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fiyat ayarları */}
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="text-base font-semibold">Fiyat</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="setExtraDiscount">Set Ek İndirimi (₺)</Label>
                  <Input
                    id="setExtraDiscount"
                    type="number"
                    step="any"
                    min="0"
                    className="tabular-nums"
                    {...register("setExtraDiscount")}
                    placeholder="0.00"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Bileşen toplamından düşülür
                  </p>
                </div>
                <div>
                  <Label htmlFor="psf" className="flex items-center gap-2">
                    PSF
                    {!psfTouchedRef.current && preview.psfSum != null && preview.psfSum > 0 && (
                      <Badge variant="outline" className="h-5 text-[10px]">
                        Otomatik
                      </Badge>
                    )}
                  </Label>
                  <Input
                    id="psf"
                    type="number"
                    step="any"
                    min="0"
                    className="tabular-nums"
                    {...register("psf", {
                      onChange: () => {
                        psfTouchedRef.current = true
                      },
                    })}
                    placeholder="0.00"
                  />
                  {preview.psfSum != null && preview.psfSum > 0 && (
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">
                        Bileşen PSF toplamı:{" "}
                        <span className="font-medium tabular-nums text-foreground">
                          {formatCurrency(preview.psfSum.toFixed(2))}
                        </span>
                        {!preview.psfAllPresent && (
                          <span className="ml-1 text-warning">
                            (bazı bileşenlerde PSF yok)
                          </span>
                        )}
                      </span>
                      {psfTouchedRef.current && (
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => {
                            psfTouchedRef.current = false
                            setValue(
                              "psf",
                              Number(preview.psfSum!.toFixed(2)),
                              { shouldDirty: true, shouldValidate: true }
                            )
                          }}
                        >
                          Otomatiğe dön
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <Label htmlFor="shelf">Raf</Label>
                  <Input
                    id="shelf"
                    {...register("shelf")}
                    placeholder="A1-01"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bileşenler */}
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">
                  Bileşenler{" "}
                  <span className="text-muted-foreground">
                    ({fields.length})
                  </span>
                </h2>
              </div>

              <ComponentPicker
                excludeIds={pickedIds}
                onPick={handlePickComponent}
              />

              {errors.components?.message && (
                <p className="text-xs text-destructive">
                  {errors.components.message}
                </p>
              )}

              {fields.length === 0 ? (
                <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Henüz bileşen eklenmedi. Yukarıdaki arama kutusundan ürün
                  bulup ekleyin.
                </p>
              ) : (
                <div className="divide-y rounded-md border">
                  {fields.map((f, idx) => {
                    const id = Number(componentsWatch[idx]?.componentId)
                    const meta = componentsMeta[id]
                    return (
                      <div
                        key={f.id}
                        className="flex items-center gap-3 p-3 text-sm"
                      >
                        <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {meta?.name ?? `Ürün #${id}`}
                          </p>
                          <p className="truncate text-xs text-muted-foreground tabular-nums">
                            {meta?.primaryBarcode ?? ""}
                            {meta?.mainPurchasePrice != null && (
                              <>
                                {" · "}
                                {meta.mainPurchasePrice.toFixed(2)} ₺
                              </>
                            )}
                            {meta && (
                              <>
                                {" · Stok: "}
                                <span
                                  className={
                                    meta.mainStock === 0
                                      ? "text-destructive"
                                      : ""
                                  }
                                >
                                  {meta.mainStock}
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label
                            htmlFor={`qty-${idx}`}
                            className="text-xs text-muted-foreground"
                          >
                            Adet
                          </Label>
                          <Input
                            id={`qty-${idx}`}
                            type="number"
                            min="1"
                            step="1"
                            className="h-8 w-20 tabular-nums"
                            {...register(`components.${idx}.quantity`, {
                              valueAsNumber: true,
                            })}
                          />
                          <input
                            type="hidden"
                            {...register(`components.${idx}.componentId`, {
                              valueAsNumber: true,
                            })}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(idx)}
                            className="h-8 w-8 p-0 text-destructive"
                            aria-label="Bileşeni kaldır"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notlar */}
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="text-base font-semibold">Notlar</h2>
              <Textarea
                {...register("notes")}
                placeholder="Set hakkında notlar (opsiyonel)"
                rows={3}
              />
            </CardContent>
          </Card>
        </div>

        {/* SAĞ: canlı önizleme */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="text-base font-semibold">Canlı Hesap</h2>

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Bileşen sayısı</span>
                  <span className="font-semibold tabular-nums">
                    {fields.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Sanal stok</span>
                  <span className="font-semibold tabular-nums">
                    {fields.length === 0 ? "—" : preview.availableStock}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-muted-foreground">
                    Hesaplanan Alış
                  </span>
                  <span className="text-lg font-bold tabular-nums">
                    {formatCurrency(preview.purchasePrice.toFixed(2))}
                  </span>
                </div>
                {preview.psfSum != null && preview.psfSum > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Bileşen PSF toplamı
                      {!preview.psfAllPresent && (
                        <span className="ml-1 text-warning">*</span>
                      )}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(preview.psfSum.toFixed(2))}
                    </span>
                  </div>
                )}
                {preview.missingPrice && fields.length > 0 && (
                  <div className="flex items-start gap-2 rounded-md bg-warning/10 p-2 text-xs text-warning-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    <span>
                      Bir veya daha fazla bileşenin alış fiyatı yok. Hesap
                      eksik olabilir.
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={pending}
              className="flex-1"
            >
              İptal
            </Button>
            <Button type="submit" disabled={pending} className="flex-1">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Güncelle" : "Set Oluştur"}
            </Button>
          </div>

          {fields.length > 0 && (
            <Badge variant="outline" className="w-full justify-center">
              {fields.length} bileşen · {preview.availableStock} set
              hazırlanabilir
            </Badge>
          )}
        </div>
      </div>
    </form>
  )
}
