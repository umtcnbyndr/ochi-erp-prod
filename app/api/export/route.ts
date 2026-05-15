/**
 * Sistem Yedekleme API
 *
 * GET /api/export?module=products     → tek modülün Excel'i (xlsx)
 * GET /api/export?module=all           → tüm modüller ZIP olarak
 *
 * Auth: requireAdmin (sadece admin sistem yedeği indirebilir)
 */
import { NextRequest, NextResponse } from "next/server"
import JSZip from "jszip"
import { requireAdmin } from "@/lib/permissions"
import {
  MODULES,
  findModule,
  dateSlug,
  workbookToBuffer,
} from "@/lib/exports"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 dakika — tüm sistem export uzun sürebilir

export async function GET(req: NextRequest) {
  await requireAdmin()
  const moduleKey = req.nextUrl.searchParams.get("module") ?? "all"

  // === Tek modül ===
  if (moduleKey !== "all") {
    const mod = findModule(moduleKey)
    if (!mod) {
      return NextResponse.json({ error: `Modül bulunamadı: ${moduleKey}` }, { status: 404 })
    }
    try {
      const wb = await mod.build()
      const buffer = workbookToBuffer(wb)
      const filename = `${mod.filename}-${dateSlug()}.xlsx`
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Export hatası" },
        { status: 500 },
      )
    }
  }

  // === Tüm sistem ZIP ===
  try {
    const zip = new JSZip()
    const slug = dateSlug()
    const errors: string[] = []

    // Tüm modülleri sırayla çalıştır, hata olsa diğerlerini kaydet
    for (const mod of MODULES) {
      try {
        const wb = await mod.build()
        const buf = workbookToBuffer(wb)
        // Grup klasörlerine ayır (Tanımlar/, Ürünler/, vs)
        const folder = mod.group.toLowerCase().replace(/[^a-z0-9]/gi, "-")
        zip.file(`${folder}/${mod.filename}-${slug}.xlsx`, buf)
      } catch (err) {
        errors.push(`${mod.label}: ${err instanceof Error ? err.message : "hata"}`)
      }
    }

    // Eğer hata varsa README ekle
    if (errors.length > 0) {
      zip.file(
        "HATALAR.txt",
        `Şu modüller export edilirken hata oluştu:\n\n${errors.join("\n")}\n`,
      )
    }

    // Bilgi dosyası
    zip.file(
      "OKUNUYORUM.txt",
      [
        `Ochi ERP Sistem Yedeği`,
        `Oluşturma Tarihi: ${new Date().toISOString()}`,
        ``,
        `Toplam Modül: ${MODULES.length}`,
        `Başarılı: ${MODULES.length - errors.length}`,
        `Başarısız: ${errors.length}`,
        ``,
        `Klasör yapısı:`,
        ...Array.from(new Set(MODULES.map((m) => `  ${m.group.toLowerCase().replace(/[^a-z0-9]/gi, "-")}/`))),
      ].join("\n"),
    )

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" })
    const filename = `ochi-erp-yedek-${slug}.zip`

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "ZIP oluşturma hatası" },
      { status: 500 },
    )
  }
}
