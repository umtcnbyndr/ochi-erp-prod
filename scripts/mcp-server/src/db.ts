/**
 * PostgreSQL connection pool for the MCP server.
 *
 * DATABASE_URL env var beklenir. SSL otomatik (production icin).
 * Read-only kullanicilar icin "search_path" set etmeye gerek yok,
 * ama transaction'lari read-only yapan helper saglar.
 */
import pg from "pg"

const { Pool } = pg

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error("[ochi-mcp] FATAL: DATABASE_URL environment variable is required")
  process.exit(1)
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

export async function closePool(): Promise<void> {
  await pool.end()
}
