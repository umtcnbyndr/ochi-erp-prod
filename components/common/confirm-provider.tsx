"use client"

import { createContext, useCallback, useContext, useState } from "react"
import { AlertTriangle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

/**
 * Global confirm dialog. Native `confirm()` yerine kullanılır.
 *
 * Kullanım:
 *   const confirm = useConfirm()
 *   const ok = await confirm({ title: "Silinecek", description: "Devam?" })
 *   if (ok) doDelete()
 *
 * Provider tree'ye bir kez yerleştirilir, hook her yerden çağrılabilir.
 */

export interface ConfirmOptions {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  /** "destructive" → kırmızı buton (silme, geri alınamaz) */
  variant?: "default" | "destructive"
}

interface ConfirmState extends ConfirmOptions {
  open: boolean
  resolve: (value: boolean) => void
}

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, open: true, resolve })
    })
  }, [])

  const handleResponse = (ok: boolean) => {
    state?.resolve(ok)
    setState(state ? { ...state, open: false } : null)
    // Animasyondan sonra temizle
    setTimeout(() => setState(null), 200)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Dialog open={state.open} onOpenChange={(o) => !o && handleResponse(false)}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <div className="flex items-start gap-3">
                {state.variant === "destructive" && (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <DialogTitle>{state.title}</DialogTitle>
                  {state.description && (
                    <DialogDescription className="mt-1.5 text-sm">
                      {state.description}
                    </DialogDescription>
                  )}
                </div>
              </div>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => handleResponse(false)}>
                {state.cancelText ?? "İptal"}
              </Button>
              <Button
                variant={state.variant === "destructive" ? "destructive" : "default"}
                onClick={() => handleResponse(true)}
                autoFocus
              >
                {state.confirmText ?? "Onayla"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error(
      "useConfirm: ConfirmProvider tree içinde değil. Layout'a <ConfirmProvider> ekle.",
    )
  }
  return ctx
}
