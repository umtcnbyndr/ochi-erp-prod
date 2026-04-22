"use client"

import Link from "next/link"
import { useSearchParams, usePathname } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Props {
  total: number
  page: number
  pageSize: number | "all"
}

const PAGE_SIZES = [50, 100, 250, 1000, "all"] as const

export function Pagination({ total, page, pageSize }: Props) {
  const pathname = usePathname()
  const params = useSearchParams()

  function hrefFor(nextPage: number, nextPs?: number | "all") {
    const sp = new URLSearchParams(params.toString())
    sp.set("page", String(nextPage))
    if (nextPs !== undefined) sp.set("ps", String(nextPs))
    return `${pathname}?${sp.toString()}`
  }

  const totalPages =
    pageSize === "all" ? 1 : Math.max(1, Math.ceil(total / pageSize))
  const hasPrev = page > 1
  const hasNext = pageSize !== "all" && page < totalPages

  const from = pageSize === "all" ? 1 : (page - 1) * pageSize + 1
  const to = pageSize === "all" ? total : Math.min(page * pageSize, total)

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {total === 0 ? "0 ürün" : `${from}–${to} / ${total} ürün`}
        </span>
        <div className="flex items-center gap-1">
          <span className="hidden sm:inline">Sayfa boyutu:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              const sp = new URLSearchParams(params.toString())
              sp.set("ps", v)
              sp.set("page", "1")
              window.location.href = `${pathname}?${sp.toString()}`
            }}
          >
            <SelectTrigger className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((p) => (
                <SelectItem key={String(p)} value={String(p)}>
                  {p === "all" ? "Hepsi" : String(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {pageSize !== "all" && totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={!hasPrev}
            asChild={hasPrev}
          >
            {hasPrev ? (
              <Link href={hrefFor(page - 1)} aria-label="Önceki">
                <ChevronLeft className="h-4 w-4" />
              </Link>
            ) : (
              <span aria-label="Önceki">
                <ChevronLeft className="h-4 w-4" />
              </span>
            )}
          </Button>
          <span className="px-3 text-sm tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={!hasNext}
            asChild={hasNext}
          >
            {hasNext ? (
              <Link href={hrefFor(page + 1)} aria-label="Sonraki">
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span aria-label="Sonraki">
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
