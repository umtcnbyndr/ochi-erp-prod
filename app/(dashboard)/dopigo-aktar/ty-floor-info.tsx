import { Card } from "@/components/ui/card"
import { Info } from "lucide-react"
import type { AutoFloorPreviewRow } from "./actions"

function tl(n: number): string {
  return "₺" + n.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

/**
 * Otomatik iso-kâr taban — salt-okunur bilgi paneli.
 * Kullanıcı ayar girmez; sistem her pazaryerinde "TY kadar kâr" tabanını
 * komisyon/kargo/stopaj farkından otomatik hesaplar (dopigo-sync Pass 2).
 */
export function TyFloorInfo({
  preview,
}: {
  preview: { referenceTyPrice: number; rows: AutoFloorPreviewRow[] }
}) {
  const { referenceTyPrice, rows } = preview
  return (
    <Card className="p-4 space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">Otomatik Kâr Tabanı</h3>
        <p className="text-sm text-muted-foreground">
          Diğer pazaryerlerinde rakip fiyatını göremediğimiz için, fiyat asla{" "}
          <b>Trendyol ile aynı kârı</b> bırakan tabanın altına inmez. Ayar
          gerekmez — sistem her pazaryerinin komisyon/kargo farkından otomatik
          hesaplar. (Trendyol referans; GIFT ürünler muaf.)
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Örnek: Trendyol fiyatı <b>{tl(referenceTyPrice)}</b> olan bir ürün için
          her pazaryerinde alt sınır aşağıdaki gibidir. Komisyonu Trendyol'dan
          yüksek olan sitede taban biraz pahalı, düşük olanda daha ucuz çıkar —
          hepsinde aynı net kâr korunur.
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Pazaryeri</th>
              <th className="py-2 px-3 font-medium text-right">Komisyon</th>
              <th className="py-2 px-3 font-medium text-right">
                Taban (TY={tl(referenceTyPrice)})
              </th>
              <th className="py-2 pl-3 font-medium text-right">TY'ye göre</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cheaper = r.pctVsTy < 0
              return (
                <tr key={r.name} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{r.name}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                    %{r.commissionPct.toLocaleString("tr-TR")}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums font-semibold">
                    {tl(r.floor)}
                  </td>
                  <td
                    className={
                      "py-2 pl-3 text-right tabular-nums font-medium " +
                      (cheaper
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400")
                    }
                  >
                    {cheaper ? "" : "+"}
                    {r.pctVsTy.toLocaleString("tr-TR")}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
