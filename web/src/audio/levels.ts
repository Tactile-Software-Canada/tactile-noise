/** Pure helpers for the user-facing controls, kept separate so they can be unit-tested. */

/**
 * Volume slider (0–100) to linear gain. A squared taper gives fine control at
 * low levels, where tinnitus and sleep listeners spend most of their time:
 * 10% ≈ −40 dB, 30% ≈ −21 dB, 50% ≈ −12 dB, 100% = 0 dB.
 */
export function volumeToGain(percent: number): number {
  const p = clamp(percent, 0, 100) / 100
  return p * p
}

/** Warmth/tilt slider (−100 dark … +100 bright) to shelf gains in dB. */
export function tiltToShelves(tilt: number): { lowDb: number; highDb: number } {
  const t = clamp(tilt, -100, 100) / 100
  return { lowDb: -t * 6, highDb: t * 6 }
}

export function clamp(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo
}

/** "1 h 05 min", "12 min", "45 s" — for the sleep-timer countdown. */
export function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  if (totalSec < 60) return `${totalSec} s`
  const totalMin = Math.ceil(totalSec / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

/** Local wall-clock time, e.g. "11:42 PM" or "23:42", for when the timer ends. */
export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
