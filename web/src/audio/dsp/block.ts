import { Smoother } from './filters'
import type { Rng } from './rng'

/**
 * Shared machinery for the sound generators. Audio is rendered in chunks of
 * {@link CONTROL_INTERVAL} samples: slow parameters (envelopes, cut-offs,
 * event rates) are updated once per chunk, then every stage processes the
 * chunk in place. Nothing in the render path allocates.
 */

export interface Generator {
  /** Overwrites `left` and `right` with the next block of audio. */
  render(left: Float32Array, right: Float32Array): void
  setIntensity(value: number): void
  /**
   * Sets a sound's extra control (see `extras` in sounds.ts) to a value in 0–1.
   * Ids a sound doesn't have are ignored.
   */
  setParam(id: string, value: number): void
  /** Tone/warmth, −1 (warmer) … 1 (brighter). Only on generators from createGenerator. */
  setTone?(value: number): void
}

/** Samples per control step (≈0.67 ms at 48 kHz). */
export const CONTROL_INTERVAL = 32

/** Largest block a generator renders in one go (the Web Audio render quantum). */
export const MAX_BLOCK = 128

export const DEFAULT_INTENSITY = 0.5

export abstract class BlockGenerator implements Generator {
  protected readonly intensity: Smoother
  protected readonly controlRate: number

  constructor(
    protected readonly sampleRate: number,
    protected readonly rng: Rng,
    intensity: number,
  ) {
    this.controlRate = sampleRate / CONTROL_INTERVAL
    this.intensity = new Smoother(this.controlRate, 0.5, clamp01(intensity))
  }

  setIntensity(value: number): void {
    this.intensity.target = clamp01(value)
  }

  setParam(_id: string, _value: number): void {}

  render(left: Float32Array, right: Float32Array): void {
    const n = left.length
    for (let start = 0; start < n; start += CONTROL_INTERVAL) {
      const end = Math.min(n, start + CONTROL_INTERVAL)
      this.intensity.step()
      this.control()
      this.chunk(left, right, start, end)
    }
  }

  /**
   * Called once per chunk; read the smoothed intensity (0–1) from
   * `this.intensity.value`. (No argument: this call can't be inlined, and a
   * number argument would be boxed on every chunk.)
   */
  protected control(): void {}

  /** Writes `[start, end)` of both channels (overwrite, not add). */
  protected abstract chunk(
    left: Float32Array,
    right: Float32Array,
    start: number,
    end: number,
  ): void

  /** A scratch buffer for intermediate signals, indexed like the output. */
  protected scratch(): Float32Array {
    return new Float32Array(MAX_BLOCK)
  }
}

/** out[i] = a[i] · ga + b[i] · gb over [start, end). */
export function mix2(
  out: Float32Array,
  a: Float32Array,
  ga: number,
  b: Float32Array,
  gb: number,
  start: number,
  end: number,
): void {
  for (let i = start; i < end; i++) out[i] = a[i]! * ga + b[i]! * gb
}

/** out[i] += src[i] · gain over [start, end). */
export function addScaled(
  out: Float32Array,
  src: Float32Array,
  gain: number,
  start: number,
  end: number,
): void {
  for (let i = start; i < end; i++) out[i] = out[i]! + src[i]! * gain
}

/** out[i] = src[i] · gain over [start, end). */
export function copyScaled(
  out: Float32Array,
  src: Float32Array,
  gain: number,
  start: number,
  end: number,
): void {
  for (let i = start; i < end; i++) out[i] = src[i]! * gain
}

/** Soft clip starts bending at −4 dBFS… */
const KNEE = 0.63
/** …and never exceeds −1 dBFS, so a single sound stays below the output limiter. */
const CEILING = 0.89
const SPAN = CEILING - KNEE

/**
 * Transparent below −4 dBFS; above that, bends smoothly towards −1 dBFS so
 * rare peaks (a loud crackle, a big wave, a tone boost) are rounded off
 * instead of clipping or triggering the output limiter.
 */
export function softClip(x: number): number {
  const a = Math.abs(x)
  if (a <= KNEE) return x
  return Math.sign(x) * (KNEE + SPAN * Math.tanh((a - KNEE) / SPAN))
}

/** Multiplies `buf` by `gain` and applies {@link softClip}, in place. */
export function trimAndClip(buf: Float32Array, gain: number): void {
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i]! * gain
    const a = Math.abs(x)
    buf[i] = a <= KNEE ? x : Math.sign(x) * (KNEE + SPAN * Math.tanh((a - KNEE) / SPAN))
  }
}

/**
 * Gain for an extra volume control (0–1): silent at 0, the recipe's own level
 * at 0.5 (the default, so the calibrated loudness holds), `max` at 1.
 */
export function boostGain(value: number, max: number): number {
  const v = clamp01(value)
  return v <= 0.5 ? 4 * v * v : 1 + (max - 1) * (2 * v - 1)
}

export function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_INTENSITY
}
