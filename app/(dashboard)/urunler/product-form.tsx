"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { productSchema, type ProductFormValues } from "@/lib/validators/product"
import { createProduct, updateProduct } from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ListingsSection } from "./[id]/listings-section"

interface InitialData {
  id: number
  name: string
  primaryBarcode: string
  supplierBarcode: string | null
  trendyolBarcode: string | null
  dopigoBarcode: string | null
  dopigoSku: string | null
  additionalBarcodes: string[]
  brandId: number | null
  categoryId: number | null
  subcategoryId: number | null
  vatRate: string
  productType: string
  pharmacyProductCode: string | null
  mainStock: number
  mainPurchasePrice: string | null
  streetStock: number
  streetPurchasePrice: string | null
  psf: string | null
  manufacturer: string | null
  minStock: number
  shelf: string | null
  status: string
  nearestExpiration: Date | null
  paoMonths: number | null
  giftMinSalePrice: string | null
  notes: string | null
}

interface ProductFormProps {
  brands: { id: number; name: string }[]
  categories: {
    id: number
    name: string
    subcategories: { id: number; name: string }[]
  }[]
  initialData?: InitialData
  /** Tria Ürün Kodu (pharmacyProductCode) sadece admin'e gösterilir */
  isAdmin?: boolean
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive mt-1">{message}</p>
}

export function ProductForm({ brands, categories, initialData, isAdmin = false }: ProductFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const isEdit = Boolean(initialData)

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: initialData
      ? ({
          name: initialData.name,
          primaryBarcode: initialData.primaryBarcode,
          supplierBarcode: initialData.supplierBarcode ?? null,
          trendyolBarcode: initialData.trendyolBarcode ?? null,
          dopigoBarcode: initialData.dopigoBarcode ?? null,
          dopigoSku: initialData.dopigoSku ?? null,
          additionalBarcodes: initialData.additionalBarcodes,
          brandId: initialData.brandId ?? undefined,
          categoryId: initialData.categoryId ?? undefined,
          subcategoryId: initialData.subcategoryId ?? null,
          vatRate: Number(initialData.vatRate),
          productType: initialData.productType as "SINGLE" | "SET" | "GIFT",
          pharmacyProductCode: initialData.pharmacyProductCode ?? null,
          mainStock: initialData.mainStock,
          mainPurchasePrice: initialData.mainPurchasePrice
            ? Number(initialData.mainPurchasePrice)
            : null,
          streetStock: initialData.streetStock,
          streetPurchasePrice: initialData.streetPurchasePrice
            ? Number(initialData.streetPurchasePrice)
            : null,
          psf: initialData.psf ? Number(initialData.psf) : null,
          manufacturer: initialData.manufacturer ?? null,
          minStock: initialData.minStock,
          shelf: initialData.shelf ?? null,
          status: initialData.status as "ACTIVE" | "PASSIVE",
          nearestExpiration: initialData.nearestExpiration
            ? initialData.nearestExpiration.toISOString().split("T")[0]
            : null,
          paoMonths: initialData.paoMonths ?? null,
          giftMinSalePrice: initialData.giftMinSalePrice
            ? Number(initialData.giftMinSalePrice)
            : null,
          notes: initialData.notes ?? null,
        } as unknown as ProductFormValues)
      : ({
          status: "ACTIVE",
          productType: "SINGLE",
          vatRate: 20,
          additionalBarcodes: [],
          mainStock: 0,
          streetStock: 0,
          minStock: 0,
        } as unknown as ProductFormValues),
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "additionalBarcodes" as never,
  })

  const errors = form.formState.errors
  const selectedCategoryId = form.watch("categoryId")
  const selectedCategory = categories.find((c) => c.id === Number(selectedCategoryId))

  function onSubmit(values: ProductFormValues) {
    const cleaned = {
      ...values,
      additionalBarcodes: (values.additionalBarcodes ?? []).filter(
        (b) => typeof b === "string" && b.trim()
      ),
    }
    startTransition(async () => {
      const result =
        isEdit && initialData
          ? await updateProduct(initialData.id, cleaned)
          : await createProduct(cleaned)

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(isEdit ? "Ürün güncellendi" : "Ürün eklendi")
      const nextId =
        isEdit
          ? initialData!.id
          : (result as { success: true; data?: { id: number } }).data?.id ?? null
      if (nextId) router.push(`/urunler/${nextId}`)
      else router.push("/urunler")
    })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <Tabs defaultValue="temel">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="temel">Temel</TabsTrigger>
              <TabsTrigger value="stok">Stok & Fiyat</TabsTrigger>
              <TabsTrigger value="detay">Detay</TabsTrigger>
            </TabsList>

            {/* TAB 1: TEMEL */}
            <TabsContent value="temel" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="name">Ürün Adı *</Label>
                  <Input
                    id="name"
                    autoFocus
                    {...form.register("name")}
                    placeholder="Ürün adını girin"
                  />
                  <FieldError message={errors.name?.message} />
                </div>

                <div>
                  <Label htmlFor="primaryBarcode">Ana Barkod *</Label>
                  <Input
                    id="primaryBarcode"
                    {...form.register("primaryBarcode")}
                    placeholder="8691234567890"
                  />
                  <FieldError message={errors.primaryBarcode?.message} />
                </div>

                <div>
                  <Label htmlFor="supplierBarcode">Tedarikçi Barkod</Label>
                  <Input
                    id="supplierBarcode"
                    {...form.register("supplierBarcode")}
                    placeholder="Distribütör/marka kodu (opsiyonel)"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Distribütör Excel'inde geçen kod. Brand catalog upload + Dopigo eşleştirmesinde yedek olarak kullanılır.
                  </p>
                  <FieldError message={errors.supplierBarcode?.message} />
                </div>

                <div>
                  <Label htmlFor="dopigoSku">Dopigo Ürün Kodu (SKU)</Label>
                  <Input
                    id="dopigoSku"
                    {...form.register("dopigoSku")}
                    placeholder="AG-NTRRPTR-DVNC"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Dopigo'nun internal SKU'su — Excel'in <code className="text-[10px]">sku</code> kolonuna yazılır.
                  </p>
                  <FieldError message={errors.dopigoSku?.message} />
                </div>

                <div>
                  <Label htmlFor="dopigoBarcode">Dopigo Tedarikçi Barkod</Label>
                  <Input
                    id="dopigoBarcode"
                    {...form.register("dopigoBarcode")}
                    placeholder="Trendyol/Dopigo tedarikçi barkodu"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Excel'in <code className="text-[10px]">Tedarikçi SKU</code> kolonuna yazılır (genelde TY barkoduyla aynı GTIN).
                  </p>
                  <FieldError message={errors.dopigoBarcode?.message} />
                </div>

                {/* Tria Ürün Kodu — sadece admin */}
                {isAdmin && (
                  <div className="sm:col-span-2 rounded-md border bg-amber-50/50 dark:bg-amber-950/20 p-3">
                    <Label htmlFor="pharmacyProductCode">
                      Tria Ürün Kodu (Eczane Sistem Kodu)
                      <span className="ml-2 text-[10px] font-normal text-amber-700 dark:text-amber-400">
                        🔒 sadece admin
                      </span>
                    </Label>
                    <Input
                      id="pharmacyProductCode"
                      {...form.register("pharmacyProductCode")}
                      placeholder="Tria sistemindeki ürün kodu (örn 105807)"
                      className="font-mono text-sm mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Eczane Excel yüklemesinde ürünleri eşleştirmek için kullanılan kod. Yanlış girilirse eczane verisi yanlış ürünle eşleşir, dikkat.
                    </p>
                    <FieldError message={errors.pharmacyProductCode?.message} />
                  </div>
                )}

                {/* Pazar yeri kayıtları (Listings) — düzenleme modunda göster */}
                {isEdit && initialData?.id && (
                  <div className="sm:col-span-2 border-t pt-4 mt-2">
                    <ListingsSection productId={initialData.id} />
                  </div>
                )}
                {!isEdit && (
                  <div className="sm:col-span-2 border-t pt-4 mt-2">
                    <h3 className="text-sm font-semibold mb-1">Ek Pazar Yeri Kayıtları</h3>
                    <p className="text-xs text-muted-foreground">
                      Bu ürünün Trendyol'da birden fazla barkodu/listingi varsa (Mustela
                      tipi) ürünü kaydettikten sonra bu sayfada ekleyebilirsin. Tek listing
                      için yukarıdaki Dopigo SKU + Dopigo Tedarikçi Barkod yeterli.
                    </p>
                  </div>
                )}

                <div className="sm:col-span-2 border-t pt-2 mt-2" />

                <div>
                  <Label>Ek Barkodlar</Label>
                  <div className="space-y-2">
                    {fields.map((field, index) => (
                      <div key={field.id} className="flex gap-2">
                        <Input
                          {...form.register(`additionalBarcodes.${index}` as const)}
                          placeholder="Ek barkod"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append("" as never)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Ek Barkod Ekle
                    </Button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="brandId">Marka *</Label>
                  <Select
                    value={form.watch("brandId")?.toString() ?? ""}
                    onValueChange={(v) =>
                      form.setValue("brandId", Number(v) as unknown as never, {
                        shouldValidate: true,
                      })
                    }
                  >
                    <SelectTrigger id="brandId">
                      <SelectValue placeholder="Marka seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={b.id.toString()}>
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
                    value={form.watch("categoryId")?.toString() ?? ""}
                    onValueChange={(v) => {
                      form.setValue("categoryId", Number(v) as unknown as never, {
                        shouldValidate: true,
                      })
                      form.setValue("subcategoryId", null)
                    }}
                  >
                    <SelectTrigger id="categoryId">
                      <SelectValue placeholder="Kategori seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id.toString()}>
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
                    value={form.watch("subcategoryId")?.toString() ?? ""}
                    onValueChange={(v) =>
                      form.setValue(
                        "subcategoryId",
                        v ? (Number(v) as unknown as never) : null,
                        { shouldValidate: true }
                      )
                    }
                    disabled={!selectedCategory || selectedCategory.subcategories.length === 0}
                  >
                    <SelectTrigger id="subcategoryId">
                      <SelectValue placeholder="Alt kategori seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedCategory?.subcategories.map((s) => (
                        <SelectItem key={s.id} value={s.id.toString()}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="vatRate">KDV Oranı (%)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="vatRate"
                      type="number"
                      className="tabular-nums"
                      {...form.register("vatRate")}
                      placeholder="20"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => form.setValue("vatRate", 1 as unknown as never)}
                    >
                      %1
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => form.setValue("vatRate", 10 as unknown as never)}
                    >
                      %10
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => form.setValue("vatRate", 20 as unknown as never)}
                    >
                      %20
                    </Button>
                  </div>
                  <FieldError message={errors.vatRate?.message} />
                </div>

                <div>
                  <Label htmlFor="productType">Ürün Tipi</Label>
                  <Select
                    value={form.watch("productType") ?? "SINGLE"}
                    onValueChange={(v) =>
                      form.setValue(
                        "productType",
                        v as "SINGLE" | "SET" | "GIFT",
                        { shouldValidate: true }
                      )
                    }
                  >
                    <SelectTrigger id="productType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SINGLE">Tekil</SelectItem>
                      <SelectItem value="SET">Set</SelectItem>
                      <SelectItem value="GIFT">Hediye</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="status">Durum</Label>
                  <Select
                    value={form.watch("status") ?? "ACTIVE"}
                    onValueChange={(v) =>
                      form.setValue("status", v as "ACTIVE" | "PASSIVE", {
                        shouldValidate: true,
                      })
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
            </TabsContent>

            {/* TAB 2: STOK & FİYAT */}
            <TabsContent value="stok" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="mainStock">Ana Stok</Label>
                  <Input
                    id="mainStock"
                    type="number"
                    className="tabular-nums"
                    {...form.register("mainStock")}
                    placeholder="0"
                  />
                  <FieldError message={errors.mainStock?.message} />
                </div>

                <div>
                  <Label htmlFor="mainPurchasePrice">
                    Ana Alış Fiyatı
                    <span className="ml-1 text-xs text-muted-foreground">(KDV dahil)</span>
                  </Label>
                  <Input
                    id="mainPurchasePrice"
                    type="number"
                    step="any"
                    className="tabular-nums"
                    {...form.register("mainPurchasePrice")}
                    placeholder="0.00"
                  />
                  <FieldError message={errors.mainPurchasePrice?.message} />
                </div>

                <div>
                  <Label htmlFor="streetStock">Sokak Stok</Label>
                  <Input
                    id="streetStock"
                    type="number"
                    className="tabular-nums"
                    {...form.register("streetStock")}
                    placeholder="0"
                  />
                  <FieldError message={errors.streetStock?.message} />
                </div>

                <div>
                  <Label htmlFor="streetPurchasePrice">
                    Sokak Alış Fiyatı
                    <span className="ml-1 text-xs text-muted-foreground">(KDV hariç)</span>
                  </Label>
                  <Input
                    id="streetPurchasePrice"
                    type="number"
                    step="any"
                    className="tabular-nums"
                    {...form.register("streetPurchasePrice")}
                    placeholder="0.00"
                  />
                  <FieldError message={errors.streetPurchasePrice?.message} />
                </div>

                <div>
                  <Label htmlFor="psf">PSF (Perakende Satış Fiyatı)</Label>
                  <Input
                    id="psf"
                    type="number"
                    step="any"
                    className="tabular-nums"
                    {...form.register("psf")}
                    placeholder="0.00"
                  />
                  <FieldError message={errors.psf?.message} />
                </div>

                {form.watch("productType") === "GIFT" && (
                  <div>
                    <Label htmlFor="giftMinSalePrice">
                      Min. Satış Fiyatı (Hediye için)
                    </Label>
                    <Input
                      id="giftMinSalePrice"
                      type="number"
                      step="any"
                      className="tabular-nums"
                      {...form.register("giftMinSalePrice")}
                      placeholder="Örn: 150"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Hediye ürünlerde alış 1 TL girilir, formül anlamsız çıkar.
                      Bu alan tüm marketplace&apos;lerde fiyat tabanı olarak kullanılır.
                      BuyBox bazlı öneri bunun altına inmez.
                    </p>
                    <FieldError message={errors.giftMinSalePrice?.message} />
                  </div>
                )}

                <div>
                  <Label htmlFor="minStock">Min. Stok</Label>
                  <Input
                    id="minStock"
                    type="number"
                    className="tabular-nums"
                    {...form.register("minStock")}
                    placeholder="0"
                  />
                  <FieldError message={errors.minStock?.message} />
                </div>

                <div>
                  <Label htmlFor="shelf">Raf</Label>
                  <Input
                    id="shelf"
                    {...form.register("shelf")}
                    placeholder="A1-01"
                  />
                  <FieldError message={errors.shelf?.message} />
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: DETAY */}
            <TabsContent value="detay" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="manufacturer">Üretici</Label>
                  <Input
                    id="manufacturer"
                    {...form.register("manufacturer")}
                    placeholder="Üretici firma adı"
                  />
                  <FieldError message={errors.manufacturer?.message} />
                </div>

                <div>
                  <Label htmlFor="nearestExpiration">En Yakın SKT</Label>
                  <Input
                    id="nearestExpiration"
                    type="date"
                    {...form.register("nearestExpiration")}
                  />
                  <FieldError message={errors.nearestExpiration?.message} />
                </div>

                <div>
                  <Label htmlFor="paoMonths">PAO (Ay)</Label>
                  <Input
                    id="paoMonths"
                    type="number"
                    className="tabular-nums"
                    {...form.register("paoMonths")}
                    placeholder="12"
                  />
                  <FieldError message={errors.paoMonths?.message} />
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor="notes">Notlar</Label>
                  <Textarea
                    id="notes"
                    rows={4}
                    {...form.register("notes")}
                    placeholder="Ürünle ilgili notlar..."
                  />
                  <FieldError message={errors.notes?.message} />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={pending}
        >
          İptal
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {isEdit ? "Güncelle" : "Kaydet"}
        </Button>
      </div>
    </form>
  )
}
