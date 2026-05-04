import { Skeleton } from "@/components/ui/skeleton"

export default function SiparislerLoading() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      {/* Tab list */}
      <div className="flex flex-wrap gap-2 border-b pb-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-lg border bg-card">
        <div className="grid grid-cols-12 gap-3 border-b px-4 py-3">
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className="col-span-3 h-4" />
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className="col-span-1 h-4" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-3 border-b px-4 py-3 last:border-0">
            <Skeleton className="col-span-2 h-5" />
            <Skeleton className="col-span-3 h-5" />
            <Skeleton className="col-span-2 h-5" />
            <Skeleton className="col-span-2 h-5" />
            <Skeleton className="col-span-2 h-6 rounded-full" />
            <Skeleton className="col-span-1 h-8" />
          </div>
        ))}
      </div>
    </div>
  )
}
