#!/usr/bin/env node
/**
 * Dev cache refresh — schema değişikliği veya CSS bozulması sonrası.
 *
 * Yapılan:
 *   1. Çalışan next dev server'ı kapat
 *   2. .next cache klasörünü sil
 *   3. Prisma client regenerate (schema değiştiyse)
 *   4. Dev server'ı 3000 portunda yeniden başlat (background)
 *
 * Kullanım:
 *   pnpm refresh        — tam yenile (kill + clean + restart)
 *   pnpm refresh:cache  — sadece cache temizle (dev manuel restart edilir)
 */
import { execSync, spawn } from "node:child_process"
import { rmSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const projectRoot = resolve(import.meta.dirname, "..")
const restart = !process.argv.includes("--no-restart")

console.log("🧹 Cache refresh başlatılıyor...")

// 1. Next dev process'lerini öldür
try {
  console.log("  → next-server / next dev process'leri kapatılıyor...")
  execSync("pkill -f 'next-server|next dev' || true", { stdio: "pipe" })
} catch {
  // pkill exit kodları takılabilir, sorun değil
}

// Port 3000 ve 3001'i de temizle
for (const port of [3000, 3001]) {
  try {
    const pids = execSync(`lsof -ti :${port} 2>/dev/null || true`, {
      encoding: "utf8",
    }).trim()
    if (pids) {
      console.log(`  → Port ${port}'deki process'ler kapatılıyor (${pids.replace(/\n/g, ", ")})`)
      execSync(`kill -9 ${pids.split("\n").join(" ")} 2>/dev/null || true`)
    }
  } catch {
    // ignore
  }
}

// 2. .next sil
const nextDir = resolve(projectRoot, ".next")
if (existsSync(nextDir)) {
  console.log("  → .next cache siliniyor...")
  rmSync(nextDir, { recursive: true, force: true })
}

// 3. Prisma client regenerate (sessiz)
try {
  console.log("  → Prisma client regenerate...")
  execSync("pnpm prisma generate", {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
  })
} catch (e) {
  console.error("  ✗ Prisma generate hatası:", e.message)
  process.exit(1)
}

console.log("✓ Cache temizlendi, Prisma client güncel")

// 4. Dev server restart (--no-restart yoksa)
if (restart) {
  console.log("  → Dev server başlatılıyor (port 3000)...")
  // Detach edilmiş arka plan process
  const dev = spawn("pnpm", ["dev"], {
    cwd: projectRoot,
    detached: true,
    stdio: "ignore",
  })
  dev.unref()
  // Server başlamasını bekle (~3 sn)
  setTimeout(() => {
    console.log("✓ Dev server başlatıldı: http://localhost:3000")
    console.log("\n💡 Tarayıcıda Cmd+Shift+R ile hard reload yap.")
    process.exit(0)
  }, 3000)
} else {
  console.log("\n💡 Şimdi 'pnpm dev' ile dev server'ı manuel başlat.")
}
