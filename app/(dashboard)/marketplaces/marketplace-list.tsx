"use client"

import { useState, useTransition } from "react"
import { MoreVertical, Pencil, Trash2, Plus, Store } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MarketplaceDialog } from "./marketplace-dialog"
import { deleteMarketplace } from "./actions"
import { formatCurrency, formatPercent } from "@/lib/utils"

interface Marketplace {
  id: number
  name: string
  commissionRate: string | number
  shippingCost: string | number
  withholdingTax: string | number
  targetProfit: string | number
  isActive: boolean
}

export function AddMarketplaceButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Yeni Pazar Yeri</span>
        <span className="sm:hidden">Ekle</span>
      </Button>
      <MarketplaceDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

export function MarketplaceList({ marketplaces }: { marketplaces: Marketplace[] }) {
  const [editing, setEditing] = useState<Marketplace | null>(null)
  const [pending, startTransition] = useTransition()

  function onDelete(id: number, name: string) {
    if (!confirm(`"${name}" pazar yerini silmek istediğinize emin misiniz?`)) return
    startTransition(async () => {
      const r = await deleteMarketplace(id)
      if (!r.success) toast.error(r.error)
      else toast.success("Silindi")
    })
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {marketplaces.map((m) => (
          <Card key={m.id} className={m.isActive ? "" : "opacity-60"}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Store className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{m.name}</p>
                    <Badge variant={m.isActive ? "success" : "outline"} className="mt-1">
                      {m.isActive ? "Aktif" : "Pasif"}
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
                    <DropdownMenuItem onClick={() => setEditing(m)}>
                      <Pencil className="h-4 w-4" />
                      Düzenle
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(m.id, m.name)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      Sil
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-sm">
                <KV label="Komisyon" value={formatPercent(m.commissionRate)} />
                <KV label="Kargo" value={formatCurrency(m.shippingCost)} />
                <KV label="Stopaj" value={formatPercent(m.withholdingTax)} />
                <KV label="Hedef Kar" value={formatPercent(m.targetProfit)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editing && (
        <MarketplaceDialog
          open={true}
          onOpenChange={(o) => !o && setEditing(null)}
          initialData={{
            id: editing.id,
            name: editing.name,
            commissionRate: Number(editing.commissionRate),
            shippingCost: Number(editing.shippingCost),
            withholdingTax: Number(editing.withholdingTax),
            targetProfit: Number(editing.targetProfit),
            isActive: editing.isActive,
          }}
        />
      )}
    </>
  )
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
    </div>
  )
}
