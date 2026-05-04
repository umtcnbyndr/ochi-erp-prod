/**
 * Health check endpoint — Coolify probe için.
 *
 * GET /api/health
 *
 * 200 → DB ulaşılabilir, app çalışıyor
 * 503 → DB kapalı veya başka kritik hata
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    // DB ping (basit query)
    await prisma.$queryRaw`SELECT 1`

    return NextResponse.json(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
        version: process.env.APP_VERSION ?? "1.0.0",
      },
      { status: 200 },
    )
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    )
  }
}
