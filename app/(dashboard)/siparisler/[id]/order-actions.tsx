"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  CheckCircle2,
  XCircle,
  Trash2,
  Loader2,
  Download,
  PackageCheck,
  Lock,
  Info,
} from "lucide-react"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { buildOrderWorkbook, buildOrderFilename } from "@/lib/excel/order-export"
import {
  confirmOrderAction,
  cancelOrderAction,
  closeOrderAction,
  deleteOrderAction,
  forceDeleteOrderAction,
  getOrderExportDataAction,
} from "../actions"

interface Props {
  orderId: number
  status: string
  isAdmin?: boolean
}

export function OrderActions({ orderId, status, isAdmin }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleConfirm() {
    if (
      !confirm(
        "Bu siparişi onaylıyorsun, satıcıya gönderildi olarak işaretlenecek. Devam?"
      )
    )
      return
    startTransition(async () => {
      const result = await confirmOrderAction(orderId)
      if (result.success) {
        toast.success("Sipariş onaylandı")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleCancel() {
    if (!confirm("Bu siparişi iptal etmek istediğine emin misin?")) return
    startTransition(async () => {
      const result = await cancelOrderAction(orderId)
      if (result.success) {
        toast.success("Sipariş iptal edildi")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDelete() {
    if (
      !confirm(
        "Bu taslak siparişi tamamen silmek istediğine emin misin? Bu işlem geri alınamaz."
      )
    )
      return
    startTransition(async () => {
      const result = await deleteOrderAction(orderId)
      if (result.success) {
        toast.success("Sipariş silindi")
        router.push("/siparisler")
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleClose() {
    if (
      !confirm(
        "Eksik kalemler olsa bile siparişi kapatmak istiyor musun? Bakiyeler yeni siparişte uyarı olarak gösterilecek."
      )
    )
      return
    startTransition(async () => {
      const result = await closeOrderAction(orderId)
      if (result.success) {
        toast.success("Sipariş kapatıldı")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleForceDelete() {
    if (
      !confirm(
        "Bu siparişi kalıcı olarak silmek istiyor musun? Tüm kalemleri ile birlikte silinecek. Bu işlem geri alınamaz!"
      )
    )
      return
    startTransition(async () => {
      const result = await forceDeleteOrderAction(orderId)
      if (result.success) {
        toast.success("Sipariş silindi")
        router.push("/siparisler")
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleExportExcel() {
    startTransition(async () => {
      const result = await getOrderExportDataAction(orderId)
      if (!result.success) {
        toast.error(result.error)
        return
      }

      const data = result.data!

      const wb = buildOrderWorkbook(data)
      const filename = buildOrderFilename(data)
      XLSX.writeFile(wb, filename)
      toast.success("Excel indirildi")
    })
  }

  const canReceive = status === "CONFIRMED" || status === "PARTIAL"

  return (
    <div className="flex flex-wrap gap-2">
      {/* Excel — her durumda görünür (iptal hariç) */}
      {status !== "CANCELLED" && (
        <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={pending}>
          {pending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-4 w-4" />
          )}
          Excel İndir
        </Button>
      )}

      {/* Taslak: Onayla + Sil */}
      {status === "DRAFT" && (
        <>
          <Button onClick={handleConfirm} disabled={pending}>
            {pending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
            )}
            Siparişi Onayla
          </Button>
          <Button variant="outline" onClick={handleDelete} disabled={pending}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            Sil
          </Button>
        </>
      )}

      {/* Onaylı/Kısmen: Mal Kabul + İptal */}
      {canReceive && (
        <>
          <Link href={`/urun-giris?siparisId=${orderId}`}>
            <Button>
              <PackageCheck className="mr-1.5 h-4 w-4" />
              Mal Kabul
            </Button>
          </Link>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={handleClose} disabled={pending}>
                {pending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="mr-1.5 h-4 w-4" />
                )}
                Siparişi Kapat
                <Info className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[280px] text-center">
              Eksik kalemler olsa bile siparişi tamamlanmış olarak kapatır. Bakiyeler bir sonraki siparişte uyarı olarak gösterilir.
            </TooltipContent>
          </Tooltip>
          <Button variant="outline" onClick={handleCancel} disabled={pending}>
            <XCircle className="mr-1.5 h-4 w-4" />
            İptal Et
          </Button>
        </>
      )}

      {/* Admin: her durumda silme (DRAFT hariç — zaten normal sil var) */}
      {isAdmin && status !== "DRAFT" && (
        <Button variant="destructive" size="sm" onClick={handleForceDelete} disabled={pending}>
          {pending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-1.5 h-4 w-4" />
          )}
          Siparişi Sil (Admin)
        </Button>
      )}
    </div>
  )
}
