/**
 * PostgreSQL connection pool for the MCP server.
 *
 * Bağlantı önceliği:
 *   1. scripts/mcp-server/.env dosyasındaki OCHI_PROD_DATABASE_URL (gitignore'lu)
 *   2. process.env.OCHI_PROD_DATABASE_URL
 *   3. process.env.DATABASE_URL (fallback — genelde local)
 *
 * Kendi .env dosyasını okuduğu için shell/GUI env inheritance'a bağımlı DEĞİL.
 * SSL otomatik (sslmode=require varsa). Read/write transaction helper'ları aşağıda.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const { Pool } = pg

// MCP server'ın kendi .env dosyasını yükle (varsa) — değerler process.env'i override eder.
const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(moduleDir, "../.env")
try {
  const content = fs.readFileSync(envPath, "utf8")
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    process.env[key] = val // .env dosyası öncelikli
  }
} catch {
  // .env yoksa sessiz geç — inherited env'e düşülür
}

const databaseUrl = process.env.OCHI_PROD_DATABASE_URL || process.env.DATABASE_URL
if (!databaseUrl) {
  console.error(
    "[ochi-mcp] FATAL: OCHI_PROD_DATABASE_URL (veya DATABASE_URL) gerekli. scripts/mcp-server/.env oluştur.",
  )
  process.exit(1)
}

// Hangi host'a bağlandığımızı stderr'e yaz (şifre yok) — prod/local teyidi için.
try {
  const u = new URL(databaseUrl)
  console.error(`[ochi-mcp] DB → ${u.host} / ${u.pathname.slice(1)}`)
} catch {
  // parse edilemezse sessiz geç
}

const useSsl = /sslmode=require/i.test(databaseUrl) || databaseUrl.includes("sslmode=require")

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

pool.on("error", (err) => {
  console.error("[ochi-mcp] pool error:", err.message)
})

/**
 * Read-only query wrapper. Her query bir READ ONLY transaction'da calisir.
 * Bu sayede MCP server'in DB'de yazma yapmasi imkansiz hale gelir.
 */
export async function readOnlyQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN READ ONLY")
    const result = await client.query<T>(sql, params)
    await client.query("COMMIT")
    return result
  } catch (err) {
    try {
      await client.query("ROLLBACK")
    } catch {}
    throw err
  } finally {
    client.release()
  }
}

/**
 * Write-capable query — INSERT/UPDATE/DELETE/DDL dahil.
 * Transaction içinde çalışır: hata olursa otomatik ROLLBACK.
 * Çoklu statement (";" ile ayrılmış) tek transaction'da atomik çalışır.
 *
 * ⚠️ FULL ACCESS — production verisini değiştirir. Dikkatli kullan.
 */
export async function writeQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await client.query<T>(sql, params)
    await client.query("COMMIT")
    return result
  } catch (err) {
    try {
      await client.query("ROLLBACK")
    } catch {}
    throw err
  } finally {
    client.release()
  }
}

export async function closePool(): Promise<void> {
  await pool.end()
}
