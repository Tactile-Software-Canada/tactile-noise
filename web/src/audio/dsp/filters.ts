/**
 * Small filters for the audio thread. Each processes `buf[start..end)` in
 * place with its state held in locals for the loop: no per-sample calls and no
 * allocation (see docs/investigations/2026-10-playback-gaps.md).
 */

const TWO_PI = 2 * Math.PI

/** One-pole low-pass (6 dB/oct). Cheap enough to retune every control step. */
export class OnePoleLP {
  private z = 0
  private a = 0

  constructor(
    private readonly sampleRate: number,
    cutoff: number,
  ) {
    this.setCutoff(cutoff)
  }

  setCutoff(hz: number): void {
    this.a = Math.exp((-TWO_PI * hz) / this.sampleRate)
  }

  process(buf: Float32Array, start: number, end: number): void {
    const a = this.a
    let z = this.z
    for (let i = start; i < end; i++) {
      const x = buf[i]!
      z = x + a * (z - x)
      buf[i] = z
    }
    this.z = z
  }
}

/** One-pole high-pass (6 dB/oct): the input minus its one-pole low-pass. */
export class OnePoleHP {
  private z = 0
  private a = 0

  constructor(
    private readonly sampleRate: number,
    cutoff: number,
  ) {
    this.setCutoff(cutoff)
  }

  setCutoff(hz: number): void {
    this.a = Math.exp((-TWO_PI * hz) / this.sampleRate)
  }

  process(buf: Float32Array, start: number, end: number): void {
    const a = this.a
    let z = this.z
    for (let i = start; i < end; i++) {
      const x = buf[i]!
      z = x + a * (z - x)
      buf[i] = x - z
    }
    this.z = z
  }
}

/** RBJ-cookbook biquad, transposed direct form II. */
export class Biquad {
  private b0 = 1
  private b1 = 0
  private b2 = 0
  private a1 = 0
  private a2 = 0
  private z1 = 0
  private z2 = 0
  private cw = 1
  private sw = 0

  constructor(private readonly sampleRate: number) {}

  reset(): void {
    this.z1 = 0
    this.z2 = 0
  }

  lowpass(hz: number, q = Math.SQRT1_2): this {
    this.w(hz)
    const cos = this.cw
    const sin = this.sw
    const alpha = sin / (2 * q)
    return this.set((1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha)
  }

  highpass(hz: number, q = Math.SQRT1_2): this {
    this.w(hz)
    const cos = this.cw
    const sin = this.sw
    const alpha = sin / (2 * q)
    return this.set((1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha)
  }

  /** Band-pass with 0 dB peak gain. */
  bandpass(hz: number, q: number): this {
    this.w(hz)
    const cos = this.cw
    const sin = this.sw
    const alpha = sin / (2 * q)
    return this.set(alpha, 0, -alpha, 1 + alpha, -2 * cos, 1 - alpha)
  }

  /** Bell boost/cut of `db` around `hz`. */
  peaking(hz: number, q: number, db: number): this {
    this.w(hz)
    const cos = this.cw
    const sin = this.sw
    const alpha = sin / (2 * q)
    const A = Math.pow(10, db / 40)
    return this.set(1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A)
  }

  /** Shelf boost/cut of `db` below `hz` (slope S = 1). */
  lowshelf(hz: number, db: number): this {
    this.w(hz)
    const cos = this.cw
    const sin = this.sw
    const A = Math.pow(10, db / 40)
    const k = 2 * Math.sqrt(A) * (sin / Math.SQRT2)
    return this.set(
      A * (A + 1 - (A - 1) * cos + k),
      2 * A * (A - 1 - (A + 1) * cos),
      A * (A + 1 - (A - 1) * cos - k),
      A + 1 + (A - 1) * cos + k,
      -2 * (A - 1 + (A + 1) * cos),
      A + 1 + (A - 1) * cos - k,
    )
  }

  /** Shelf boost/cut of `db` above `hz` (slope S = 1). */
  highshelf(hz: number, db: number): this {
    this.w(hz)
    const cos = this.cw
    const sin = this.sw
    const A = Math.pow(10, db / 40)
    const k = 2 * Math.sqrt(A) * (sin / Math.SQRT2)
    return this.set(
      A * (A + 1 + (A - 1) * cos + k),
      -2 * A * (A - 1 + (A + 1) * cos),
      A * (A + 1 + (A - 1) * cos - k),
      A + 1 - (A - 1) * cos + k,
      2 * (A - 1 - (A + 1) * cos),
      A + 1 - (A - 1) * cos - k,
    )
  }

  process(buf: Float32Array, start: number, end: number): void {
    const { b0, b1, b2, a1, a2 } = this
    let z1 = this.z1
    let z2 = this.z2
    for (let i = start; i < end; i++) {
      const x = buf[i]!
      const y = b0 * x + z1
      z1 = b1 * x - a1 * y + z2
      z2 = b2 * x - a2 * y
      buf[i] = y
    }
    this.z1 = z1
    this.z2 = z2
  }

  /** Sets {@link cw}/{@link sw} (no object returned: retuning must not allocate). */
  private w(hz: number): void {
    const w = (TWO_PI * Math.min(hz, this.sampleRate * 0.45)) / this.sampleRate
    this.cw = Math.cos(w)
    this.sw = Math.sin(w)
  }

  private set(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): this {
    this.b0 = b0 / a0
    this.b1 = b1 / a0
    this.b2 = b2 / a0
    this.a1 = a1 / a0
    this.a2 = a2 / a0
    return this
  }
}

/**
 * Smooths a control value towards its target (one-pole, `seconds` ≈ time to
 * reach ~63%). Stepped once per control interval, not per sample.
 */
export class Smoother {
  value: number
  target: number
  private readonly coeff: number

  constructor(controlRate: number, seconds: number, initial: number) {
    this.value = initial
    this.target = initial
    this.coeff = Math.exp(-1 / (seconds * controlRate))
  }

  /** Advances one control step; read the result from {@link value}. */
  step(): void {
    this.value = this.target + this.coeff * (this.value - this.target)
  }
}

/**
 * Slowly wandering random value in [0, 1]: picks a new random target every
 * `period` seconds (jittered) and glides towards it. Used for natural drift.
 * Stepped once per control interval.
 */
export class Wander {
  /** Current value; updated by {@link step}. */
  value: number
  private readonly smoother: Smoother
  private countdown = 0

  constructor(
    private readonly controlRate: number,
    private readonly rng: { next(): number },
    private readonly period: number,
  ) {
    this.smoother = new Smoother(controlRate, period / 2, rng.next())
    this.smoother.target = rng.next()
    this.value = this.smoother.value
  }

  /** Advances one control step; read the result from {@link value}. */
  step(): void {
    if (--this.countdown <= 0) {
      this.smoother.target = this.rng.next()
      this.countdown = Math.round(this.period * this.controlRate * (0.5 + this.rng.next()))
    }
    this.smoother.step()
    this.value = this.smoother.value
  }
}
