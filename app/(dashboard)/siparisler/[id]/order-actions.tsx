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
import { useConfirm } from "@/components/common/confirm-provider"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import {
  confirmOrderAction,
  cancelOrderAction,
  closeOrderAction,
  deleteOrderAction,
  forceDeleteOrderAction,
  exportStyledOrderExcelAction,
} from "../actions"

interface Props {
  orderId: number
  status: string
  isAdmin?: boolean
}

export function OrderActions({ orderId, status, isAdmin }: Props) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [pending, startTransition] = useTransition()

  async function handleConfirm() {
    const ok = await confirmDialog({
      title: "Sipariş onaylanacak",
      description: "Satıcıya gönderildi olarak işaretlenecek. Devam?",
      confirmText: "Onayla",
    })
    if (!ok) return
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

  async function handleCancel() {
    const ok = await confirmDialog({
      title: "Sipariş iptal edilecek",
      description: "Devam etmek istiyor musun?",
      confirmText: "Evet, iptal et",
      variant: "destructive",
    })
    if (!ok) return
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

  async function handleDelete() {
    const ok = await confirmDialog({
      title: "Taslak sipariş silinecek",
      description: "Bu işlem geri alınamaz.",
      confirmText: "Evet, sil",
      variant: "destructive",
    })
    if (!ok) return
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

  async function handleClose() {
    const ok = await confirmDialog({
      title: "Sipariş kapatılacak",
      description:
        "Eksik kalemler olsa bile sipariş kapatılır. Bakiyeler yeni siparişte uyarı olarak gösterilir.",
      confirmText: "Evet, kapat",
    })
    if (!ok) return
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

  async function handleForceDelete() {
    const ok = await confirmDialog({
      title: "Sipariş KALICI silinecek",
      description: "Tüm kalemleri ile birlikte silinir. Bu işlem geri alınamaz.",
      confirmText: "Evet, sil",
      variant: "destructive",
    })
    if (!ok) return
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
      const result = await exportStyledOrderExcelAction(orderId)
      if (!result.success) {
        toast.error(result.error)
        return
      }

      const { filename, base64 } = result.data!

      // base64 → Blob → indir
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
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
