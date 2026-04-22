import { describe, it, expect } from "vitest"
import { checkPsfSanity } from "@/lib/pricing/psf-check"

describe("checkPsfSanity — kullanıcı örneği", () => {
  it("alış 20, PSF 1000 → şüpheli (0.02 < 0.1)", () => {
    const r = checkPsfSanity(20, 1000)
    expect(r.suspicious).toBe(true)
    expect(r.ratio).toBeCloseTo(0.02, 3)
    expect(r.message).toContain("PSF")
  })

  it("alış 800, PSF 1000 → normal (0.8 > 0.1)", () => {
    const r = checkPsfSanity(800, 1000)
    expect(r.suspicious).toBe(false)
  })

  it("PSF 0 → check yok", () => {
    const r = checkPsfSanity(100, 0)
    expect(r.suspicious).toBe(false)
    expect(r.ratio).toBeNull()
  })

  it("özel eşik ile", () => {
    const r = checkPsfSanity(50, 100, 0.6)
    expect(r.suspicious).toBe(true)
    expect(r.ratio).toBe(0.5)
  })
})
