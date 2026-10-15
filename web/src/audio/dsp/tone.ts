import { Biquad } from './filters'

/**
 * The Tone (warmth) control: a low shelf at 250 Hz and a high shelf at 3 kHz,
 * ±6 dB in opposite directions. It runs inside the generator, *before* the
 * soft clip, so a boost can never push peaks into the output limiter (which
 * clamps abruptly and was heard as popping at high volume).
 */
export class Tone {
  private current = 0
  private target = 0
  private readonly low: [Biquad, Biquad]
  private readonly high: [Biquad, Biquad]

  constructor(sampleRate: number, initial = 0) {
    this.low = [new Biquad(sampleRate), new Biquad(sampleRate)]
    this.high = [new Biquad(sampleRate), new Biquad(sampleRate)]
    this.target = clampTone(initial)
    this.current = this.target
    this.retune()
  }

  /** −1 (warmer) … 0 (neutral) … 1 (brighter). */
  set(value: number): void {
    this.target = clampTone(value)
  }

  process(left: Float32Array, right: Float32Array): void {
    if (this.current !== this.target) {
      // Glide ~0.25 s across the full range, retuning once per block.
      const step = 0.01
      const d = this.target - this.current
      this.current = Math.abs(d) <= step ? this.target : this.current + Math.sign(d) * step
      this.retune()
    } else if (this.current === 0) {
      return // neutral: no filtering at all
    }
    const n = left.length
    this.low[0].process(left, 0, n)
    this.high[0].process(left, 0, n)
    this.low[1].process(right, 0, n)
    this.high[1].process(right, 0, n)
  }

  private retune(): void {
    const db = this.current * 6
    for (const f of this.low) f.lowshelf(250, -db)
    for (const f of this.high) f.highshelf(3000, db)
  }
}

function clampTone(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(-1, v)) : 0
}
