"use client"

import { useState, useTransition } from "react"
import { ChevronRight, Folder, FolderPlus, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  createCategory,
  updateCategory,
  deleteCategory,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
} from "./actions"

interface Subcategory {
  id: number
  name: string
  categoryId: number
  _count?: { products: number }
}

interface Category {
  id: number
  name: string
  subcategories: Subcategory[]
  _count?: { products: number }
}

type DialogState =
  | { kind: "none" }
  | { kind: "category"; data?: Category }
  | { kind: "subcategory"; categoryId: number; data?: Subcategory }

export function CategoryManager({ categories }: { categories: Category[] }) {
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" })
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [pending, startTransition] = useTransition()

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleDelete(kind: "category" | "subcategory", id: number, name: string) {
    const msg = kind === "category" ? "kategoriyi" : "alt kategoriyi"
    if (!confirm(`"${name}" ${msg} silmek istediğinize emin misiniz?`)) return
    startTransition(async () => {
      const r = kind === "category" ? await deleteCategory(id) : await deleteSubcategory(id)
      if (!r.success) toast.error(r.error)
      else toast.success("Silindi")
    })
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {categories.map((cat) => {
          const open = expanded.has(cat.id)
          return (
            <Card key={cat.id}>
              <CardContent className="p-0">
                <div className="flex items-center gap-2 px-3 py-3 sm:px-4">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => toggle(cat.id)}
                    aria-label={open ? "Kapat" : "Aç"}
                  >
                    <ChevronRight
                      className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
                    />
                  </Button>
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{cat.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cat.subcategories.length} alt kategori · {cat._count?.products ?? 0} ürün
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDialog({ kind: "subcategory", categoryId: cat.id })}
                      aria-label="Alt kategori ekle"
                    >
                      <FolderPlus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDialog({ kind: "category", data: cat })}
                      aria-label="Düzenle"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete("category", cat.id, cat.name)}
                      disabled={pending}
                      aria-label="Sil"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {open && cat.subcategories.length > 0 && (
                  <div className="border-t bg-muted/20 px-2 py-2 sm:px-4">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {cat.subcategories.map((sub) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2 text-sm"
                        >
                          <span className="truncate">{sub.name}</span>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="tabular-nums text-xs">
                              {sub._count?.products ?? 0}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() =>
                                setDialog({
                                  kind: "subcategory",
                                  categoryId: cat.id,
                                  data: sub,
                                })
                              }
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={pending}
                              onClick={() => handleDelete("subcategory", sub.id, sub.name)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <CategoryDialog
        state={dialog}
        categories={categories}
        onClose={() => setDialog({ kind: "none" })}
      />
    </>
  )
}

export function AddCategoryButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Yeni Kategori</span>
        <span className="sm:hidden">Ekle</span>
      </Button>
      <CategoryDialog
        state={open ? { kind: "category" } : { kind: "none" }}
        categories={[]}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

function CategoryDialog({
  state,
  categories,
  onClose,
}: {
  state: DialogState
  categories: Category[]
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  if (state.kind === "none") return null

  const activeState = state
  const isCategory = activeState.kind === "category"
  const existingId = activeState.data?.id
  const existingName = activeState.data?.name ?? ""
  const existingCategoryId =
    activeState.kind === "subcategory"
      ? activeState.data?.categoryId ?? activeState.categoryId
      : undefined
  const isEdit = Boolean(existingId)

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      let r
      if (activeState.kind === "category") {
        r = activeState.data
          ? await updateCategory(activeState.data.id, formData)
          : await createCategory(formData)
      } else {
        r = activeState.data
          ? await updateSubcategory(activeState.data.id, formData)
          : await createSubcategory(formData)
      }
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(isEdit ? "Güncellendi" : "Eklendi")
      onClose()
    })
  }

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isCategory
              ? isEdit ? "Kategori Düzenle" : "Yeni Kategori"
              : isEdit ? "Alt Kategori Düzenle" : "Yeni Alt Kategori"}
          </DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Ad</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={existingName}
              placeholder="Örn: Cilt Bakımı"
            />
          </div>
          {!isCategory && existingCategoryId !== undefined && (
            <div className="space-y-2">
              <Label htmlFor="categoryId">Kategori</Label>
              <Select
                name="categoryId"
                defaultValue={String(existingCategoryId)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kategori seçin" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              İptal
            </Button>
            <Button type="submit" disabled={pending}>
              {isEdit ? "Kaydet" : "Ekle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
