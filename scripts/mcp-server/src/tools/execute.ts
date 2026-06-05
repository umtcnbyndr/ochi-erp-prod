/**
 * execute_sql — serbest SQL çalıştırma (FULL ACCESS: SELECT/INSERT/UPDATE/DELETE/DDL).
 *
 * ⚠️ Production verisini değiştirebilir. SELECT read-only transaction'da,
 * yazma işlemleri normal transaction'da (hata → otomatik ROLLBACK) çalışır.
 *
 * Tehlikeli komutlar (DROP/TRUNCATE/DELETE-without-WHERE) çalıştırılır ama
 * sonuçta uyarı eklenir.
 */
import { z } from "zod"
import { readOnlyQuery, writeQuery } from "../db.js"

export const executeSqlSchema = z.object({
  sql: z.string().describe("Çalıştırılacak SQL (SELECT/INSERT/UPDATE/DELETE/DDL). $1,$2 ile parametrik."),
  params: z.array(z.unknown()).optional().describe("Parametre değerleri ($1, $2 ... sırasıyla)"),
})

function isReadOnly(sql: string): boolean {
  const trimmed = sql.trim().toLowerCase()
  // İlk kelime SELECT/WITH/SHOW/EXPLAIN ise read-only
  return /^(select|with|show|explain|table)\b/.test(trimmed)
}

function dangerWarnings(sql: string): string[] {
  const lower = sql.toLowerCase()
  const warns: string[] = []
  if (/\bdrop\s+(table|database|schema|column)/.test(lower)) warns.push("DROP komutu — yapısal silme")
  if (/\btruncate\b/.test(lower)) warns.push("TRUNCATE — tablo tümüyle boşaltılıyor")
  if (/\bdelete\s+from\b/.test(lower) && !/\bwhere\b/.test(lower)) warns.push("WHERE'siz DELETE — TÜM satırlar silinir!")
  if (/\bupdate\b/.test(lower) && !/\bwhere\b/.test(lower)) warns.push("WHERE'siz UPDATE — TÜM satırlar değişir!")
  return warns
}

export async function executeSql(input: z.infer<typeof executeSqlSchema>) {
  const params = (input.params ?? []) as unknown[]
  const readOnly = isReadOnly(input.sql)
  const warnings = dangerWarnings(input.sql)

  const result = readOnly
    ? await readOnlyQuery(input.sql, params)
    : await writeQuery(input.sql, params)

  return {
    mode: readOnly ? "read-only" : "write",
    command: result.command, // SELECT / INSERT / UPDATE / DELETE
    rowCount: result.rowCount,
    rows: result.rows.slice(0, 200), // ilk 200 satır (kalabalık dönüşü kes)
    truncated: result.rows.length > 200,
    ...(warnings.length > 0 ? { warnings } : {}),
  }
}
