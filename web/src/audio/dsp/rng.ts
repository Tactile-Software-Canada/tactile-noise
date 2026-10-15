/**
 * Seeded PRNG (xoshiro128**). Deterministic across platforms so the same seed
 * always renders the same audio, which is what the golden tests rely on.
 */
export class Rng {
  private a: number
  private b: number
  private c: number
  private d: number

  constructor(seed: number) {
    // Expand the seed with splitmix32 so nearby seeds give unrelated streams.
    let s = seed >>> 0
    const next = () => {
      s = (s + 0x9e3779b9) >>> 0
      let z = s
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
      return (z ^ (z >>> 16)) >>> 0
    }
    this.a = next()
    this.b = next()
    this.c = next()
    this.d = next()
    if ((this.a | this.b | this.c | this.d) === 0) this.a = 1
  }

  /** Uniform 32-bit unsigned integer. */
  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.b, 5), 7), 9) >>> 0
    const t = this.b << 9
    this.c ^= this.a
    this.d ^= this.b
    this.b ^= this.c
    this.a ^= this.d
    this.c ^= t
    this.d = rotl(this.d, 11)
    return result
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296
  }

  /** Uniform in [-1, 1). */
  bipolar(): number {
    return this.nextU32() / 2147483648 - 1
  }

  /**
   * Fills `buf[start..end)` with uniform values in [-gain, gain). Same sequence
   * as repeated {@link bipolar} calls, but with the state in locals and no
   * calls in the loop, so it stays allocation-free on the audio thread.
   */
  fillBipolar(buf: Float32Array, start: number, end: number, gain = 1): void {
    let a = this.a
    let b = this.b
    let c = this.c
    let d = this.d
    const scale = gain / 2147483648
    for (let i = start; i < end; i++) {
      const x = Math.imul(b, 5)
      const result = Math.imul((x << 7) | (x >>> 25), 9) >>> 0
      const t = b << 9
      c ^= a
      d ^= b
      b ^= c
      a ^= d
      c ^= t
      d = (d << 11) | (d >>> 21)
      buf[i] = result * scale - gain
    }
    this.a = a
    this.b = b
    this.c = c
    this.d = d
  }

  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next()
  }

  /** Log-uniform in [lo, hi): even spread across octaves or decibels. */
  logRange(lo: number, hi: number): number {
    return lo * Math.pow(hi / lo, this.next())
  }

  /** A child generator with an independent stream. */
  fork(): Rng {
    return new Rng(this.nextU32())
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0
}
