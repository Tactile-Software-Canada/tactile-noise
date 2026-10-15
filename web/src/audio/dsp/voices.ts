import type { Rng } from './rng'

/**
 * Short sound events (rain drops, bubbles, crackles, clacks) mixed on top of a
 * bed. All voice state lives in pre-allocated typed arrays, so spawning and
 * rendering never allocate on the audio thread.
 *
 * - burst: noise → band-pass, instant/linear attack, exponential decay.
 *   Noise comes from a shared table read at a random offset per voice, so
 *   overlapping bursts are uncorrelated without per-sample RNG calls.
 * - chirp: sine starting at `freq` and gliding exponentially by `glide`.
 */

const BURST = 0
const CHIRP = 1
const NOISE_TABLE_SIZE = 1 << 16
const NOISE_MASK = NOISE_TABLE_SIZE - 1

export class VoicePool {
  private readonly size: number
  private readonly active: Uint8Array
  private readonly kind: Uint8Array
  private readonly delay: Int32Array
  private readonly noisePos: Int32Array
  private readonly attacking: Uint8Array
  private readonly env: Float64Array
  private readonly peak: Float64Array
  private readonly attackInc: Float64Array
  private readonly decayMul: Float64Array
  private readonly gainL: Float64Array
  private readonly gainR: Float64Array
  // chirp
  private readonly phase: Float64Array
  private readonly inc: Float64Array
  private readonly incMul: Float64Array
  // burst band-pass (normalised coefficients; b1 = 0, b2 = −b0 for a band-pass)
  private readonly b0: Float64Array
  private readonly a1: Float64Array
  private readonly a2: Float64Array
  private readonly z1: Float64Array
  private readonly z2: Float64Array
  private readonly noise: Float32Array

  constructor(
    private readonly sampleRate: number,
    private readonly rng: Rng,
    size: number,
  ) {
    this.size = size
    this.active = new Uint8Array(size)
    this.kind = new Uint8Array(size)
    this.delay = new Int32Array(size)
    this.noisePos = new Int32Array(size)
    this.attacking = new Uint8Array(size)
    this.env = new Float64Array(size)
    this.peak = new Float64Array(size)
    this.attackInc = new Float64Array(size)
    this.decayMul = new Float64Array(size)
    this.gainL = new Float64Array(size)
    this.gainR = new Float64Array(size)
    this.phase = new Float64Array(size)
    this.inc = new Float64Array(size)
    this.incMul = new Float64Array(size)
    this.b0 = new Float64Array(size)
    this.a1 = new Float64Array(size)
    this.a2 = new Float64Array(size)
    this.z1 = new Float64Array(size)
    this.z2 = new Float64Array(size)
    this.noise = new Float32Array(NOISE_TABLE_SIZE)
    rng.fillBipolar(this.noise, 0, NOISE_TABLE_SIZE)
  }

  /** Noise burst through a band-pass. Silently dropped if all voices are busy. */
  burst(
    delay: number,
    freq: number,
    q: number,
    amp: number,
    attack: number,
    decay: number,
    pan: number,
  ): void {
    const v = this.start(delay, amp, attack, decay, pan)
    if (v < 0) return
    this.kind[v] = BURST
    this.noisePos[v] = this.rng.nextU32() & NOISE_MASK
    const w = (2 * Math.PI * Math.min(freq, this.sampleRate * 0.45)) / this.sampleRate
    const alpha = Math.sin(w) / (2 * q)
    const a0 = 1 + alpha
    this.b0[v] = alpha / a0
    this.a1[v] = (-2 * Math.cos(w)) / a0
    this.a2[v] = (1 - alpha) / a0
    this.z1[v] = 0
    this.z2[v] = 0
  }

  /** Sine chirp gliding from `freq` by the ratio `glide` over the decay. */
  chirp(
    delay: number,
    freq: number,
    glide: number,
    amp: number,
    attack: number,
    decay: number,
    pan: number,
  ): void {
    const v = this.start(delay, amp, attack, decay, pan)
    if (v < 0) return
    this.kind[v] = CHIRP
    this.phase[v] = 0
    this.inc[v] = (2 * Math.PI * freq) / this.sampleRate
    this.incMul[v] = Math.pow(glide, 1 / Math.max(1, decay * this.sampleRate))
  }

  /** Adds all active voices into `left`/`right` over `[start, end)`. */
  process(left: Float32Array, right: Float32Array, start: number, end: number): void {
    const noise = this.noise
    for (let v = 0; v < this.size; v++) {
      if (this.active[v] === 0) continue
      let i = start
      let delay = this.delay[v]!
      if (delay > 0) {
        const skip = Math.min(delay, end - start)
        delay -= skip
        i += skip
        this.delay[v] = delay
        if (i >= end) continue
      }
      let env = this.env[v]!
      let attacking = this.attacking[v] === 1
      const peak = this.peak[v]!
      const attackInc = this.attackInc[v]!
      const decayMul = this.decayMul[v]!
      const floor = peak * 0.001
      const gl = this.gainL[v]!
      const gr = this.gainR[v]!
      let alive = true
      if (this.kind[v] === BURST) {
        const b0 = this.b0[v]!
        const a1 = this.a1[v]!
        const a2 = this.a2[v]!
        let z1 = this.z1[v]!
        let z2 = this.z2[v]!
        let pos = this.noisePos[v]!
        for (; i < end; i++) {
          if (attacking) {
            env += attackInc
            if (env >= peak) {
              env = peak
              attacking = false
            }
          } else {
            env *= decayMul
            if (env < floor) {
              alive = false
              break
            }
          }
          const x = noise[pos]!
          pos = (pos + 1) & NOISE_MASK
          const y = b0 * x + z1
          z1 = -a1 * y + z2
          z2 = -b0 * x - a2 * y
          const s = y * env
          left[i] = left[i]! + s * gl
          right[i] = right[i]! + s * gr
        }
        this.z1[v] = z1
        this.z2[v] = z2
        this.noisePos[v] = pos
      } else {
        let phase = this.phase[v]!
        let inc = this.inc[v]!
        const incMul = this.incMul[v]!
        for (; i < end; i++) {
          if (attacking) {
            env += attackInc
            if (env >= peak) {
              env = peak
              attacking = false
            }
          } else {
            env *= decayMul
            if (env < floor) {
              alive = false
              break
            }
          }
          const s = Math.sin(phase) * env
          phase += inc
          inc *= incMul
          left[i] = left[i]! + s * gl
          right[i] = right[i]! + s * gr
        }
        this.phase[v] = phase
        this.inc[v] = inc
      }
      this.env[v] = env
      this.attacking[v] = attacking ? 1 : 0
      if (!alive) this.active[v] = 0
    }
  }

  private start(delay: number, amp: number, attack: number, decay: number, pan: number): number {
    let v = 0
    while (v < this.size && this.active[v] === 1) v++
    if (v === this.size) return -1
    const sr = this.sampleRate
    this.active[v] = 1
    this.delay[v] = Math.max(0, Math.floor(delay))
    this.peak[v] = amp
    this.env[v] = 0
    this.attacking[v] = 1
    this.attackInc[v] = amp / Math.max(1, attack * sr)
    this.decayMul[v] = Math.pow(0.001, 1 / Math.max(1, decay * sr))
    // Constant-power pan.
    const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4
    this.gainL[v] = Math.cos(angle)
    this.gainR[v] = Math.sin(angle)
    return v
  }
}

/**
 * Poisson event timing without a per-sample random check: draws exponential
 * gaps between events and reports which sample offsets in the next chunk
 * have one. Offsets go into a pre-allocated array.
 */
export class PoissonClock {
  /** Sample offsets (from the chunk start) of the events from the last {@link tick}. */
  readonly offsets = new Int32Array(64)
  private countdown = -1

  constructor(
    private readonly rng: Rng,
    private readonly sampleRate: number,
  ) {}

  /** Advances by `length` samples at `ratePerSecond`; returns how many events fall in it. */
  tick(length: number, ratePerSecond: number): number {
    if (ratePerSecond <= 0) return 0
    if (this.countdown < 0) this.countdown = this.gap(ratePerSecond)
    let count = 0
    while (this.countdown < length) {
      if (count < this.offsets.length) this.offsets[count++] = Math.floor(this.countdown)
      this.countdown += this.gap(ratePerSecond)
    }
    this.countdown -= length
    return count
  }

  private gap(rate: number): number {
    return (-Math.log(1 - this.rng.next()) * this.sampleRate) / rate
  }
}
