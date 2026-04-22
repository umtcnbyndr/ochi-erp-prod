"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BrandDialog } from "./brand-dialog"

export function AddBrandButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Yeni Marka</span>
        <span className="sm:hidden">Ekle</span>
      </Button>
      <BrandDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
