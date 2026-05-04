import { Skeleton } from "@/components/ui/skeleton"

export default function UrunlerLoading() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <Skeleton className="h-10 w-full sm:w-72" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Table skeleton: header + 10 rows */}
      <div className="rounded-lg border bg-card">
        <div className="grid grid-cols-12 gap-3 border-b px-4 py-3">
          <Skeleton className="col-span-4 h-4" />
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className="col-span-2 h-4" />
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-3 border-b px-4 py-3 last:border-0">
            <Skeleton className="col-span-4 h-5" />
            <Skeleton className="col-span-2 h-5" />
            <Skeleton className="col-span-2 h-5" />
            <Skeleton className="col-span-2 h-5" />
            <Skeleton className="col-span-2 h-8" />
          </div>
        ))}
      </div>
    </div>
  )
}
