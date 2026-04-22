"use client"

import { useState, useTransition } from "react"
import {
  MoreVertical,
  Pencil,
  Trash2,
  Plus,
  Users,
  Building2,
  User,
  Phone,
  MapPin,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  createCounterparty,
  updateCounterparty,
  deleteCounterparty,
} from "./actions"

type CounterpartyType = "PHARMACY" | "DISTRIBUTOR" | "INDIVIDUAL"

interface Counterparty {
  id: number
  name: string
  type: CounterpartyType
  phone: string | null
  address: string | null
  notes: string | null
  _count?: { exchanges: number }
}

const TYPE_LABEL: Record<CounterpartyType, string> = {
  PHARMACY: "Eczane",
  DISTRIBUTOR: "Distribütör",
  INDIVIDUAL: "Birey",
}

const TYPE_ICON: Record<CounterpartyType, React.ComponentType<{ className?: string }>> = {
  PHARMACY: Building2,
  DISTRIBUTOR: Users,
  INDIVIDUAL: User,
}

export function AddCounterpartyButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Yeni Cari</span>
        <span className="sm:hidden">Ekle</span>
      </Button>
      <CounterpartyDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

export function CounterpartyList({ list }: { list: Counterparty[] }) {
  const [editing, setEditing] = useState<Counterparty | null>(null)
  const [pending, startTransition] = useTransition()

  function onDelete(id: number, name: string) {
    if (!confirm(`"${name}" carisini silmek istediğinize emin misiniz?`)) return
    startTransition(async () => {
      const r = await deleteCounterparty(id)
      if (!r.success) toast.error(r.error)
      else toast.success("Silindi")
    })
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => {
          const Icon = TYPE_ICON[c.type]
          return (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{c.name}</p>
                      <Badge variant="outline" className="mt-1">
                        {TYPE_LABEL[c.type]}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" disabled={pending}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing(c)}>
                        <Pencil className="h-4 w-4" /> Düzenle
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(c.id, c.name)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" /> Sil
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-3 space-y-1.5 text-sm">
                  {c.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{c.phone}</span>
                    </div>
                  )}
                  {c.address && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{c.address}</span>
                    </div>
                  )}
                </div>
                {(c._count?.exchanges ?? 0) > 0 && (
                  <div className="mt-3 border-t pt-3">
                    <Badge variant="secondary">
                      {c._count?.exchanges} takas işlemi
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {editing && (
        <CounterpartyDialog
          open={true}
          onOpenChange={(o) => !o && setEditing(null)}
          initialData={editing}
        />
      )}
    </>
  )
}

function CounterpartyDialog({
  open,
  onOpenChange,
  initialData,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  initialData?: Counterparty
}) {
  const [pending, startTransition] = useTransition()
  const isEdit = Boolean(initialData?.id)

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const r = isEdit && initialData?.id
        ? await updateCounterparty(initialData.id, formData)
        : await createCounterparty(formData)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(isEdit ? "Güncellendi" : "Eklendi")
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Cari Düzenle" : "Yeni Cari"}</DialogTitle>
          <DialogDescription>
            Takas işlemlerinde karşı taraf bilgileri
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Ad / Firma Unvanı</Label>
            <Input id="name" name="name" required defaultValue={initialData?.name ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Tip</Label>
            <Select name="type" defaultValue={initialData?.type ?? "PHARMACY"}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PHARMACY">Eczane</SelectItem>
                <SelectItem value="DISTRIBUTOR">Distribütör</SelectItem>
                <SelectItem value="INDIVIDUAL">Birey</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telefon</Label>
            <Input
              id="phone"
              name="phone"
              defaultValue={initialData?.phone ?? ""}
              placeholder="0212 xxx xx xx"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Adres</Label>
            <Textarea
              id="address"
              name="address"
              rows={2}
              defaultValue={initialData?.address ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Not</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={initialData?.notes ?? ""}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
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
