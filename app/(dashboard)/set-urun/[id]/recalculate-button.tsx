"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { recalculateSetPrice } from "../actions"
import { formatCurrency } from "@/lib/utils"

export function RecalculateButton({
  id,
  stale = false,
}: {
  id: number
  stale?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const r = await recalculateSetPrice(id)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      if (r.data?.changed) {
        if (r.data.newPrice != null) {
          toast.success(
            `Fiyat güncellendi: ${formatCurrency(r.data.oldPrice.toFixed(2))} → ${formatCurrency(r.data.newPrice.toFixed(2))}`
          )
        } else {
          toast.warning(
            `Fiyat hesaplanamıyor — bir bileşenin ana ve eczane alışı eksik. Önceki fiyat: ${formatCurrency(r.data.oldPrice.toFixed(2))}`
          )
        }
      } else {
        toast.success("Fiyat zaten güncel")
      }
      router.refresh()
    })
  }

  return (
    <Button
      variant={stale ? "default" : "outline"}
      onClick={onClick}
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      {stale ? "Fiyatı Güncelle" : "Yeniden Hesapla"}
    </Button>
  )
}
