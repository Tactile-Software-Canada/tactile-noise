import { Biquad, OnePoleLP } from './filters'
import type { Rng } from './rng'

/** White noise in [-1, 1). */
export class WhiteNoise {
  constructor(private readonly rng: Rng) {}

  fill(buf: Float32Array, start: number, end: number): void {
    this.rng.fillBipolar(buf, start, end)
  }
}

/** Pink noise (−3 dB/oct) using Paul Kellet's refined filter. Unit ≈ white input level. */
export class PinkNoise {
  private b0 = 0
  private b1 = 0
  private b2 = 0
  private b3 = 0
  private b4 = 0
  private b5 = 0
  private b6 = 0

  constructor(private readonly rng: Rng) {}

  fill(buf: Float32Array, start: number, end: number): void {
    this.rng.fillBipolar(buf, start, end)
    let { b0, b1, b2, b3, b4, b5, b6 } = this
    for (let i = start; i < end; i++) {
      const w = buf[i]!
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.969 * b2 + w * 0.153852
      b3 = 0.8665 * b3 + w * 0.3104856
      b4 = 0.55 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.016898
      buf[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
      b6 = w * 0.115926
    }
    this.b0 = b0
    this.b1 = b1
    this.b2 = b2
    this.b3 = b3
    this.b4 = b4
    this.b5 = b5
    this.b6 = b6
  }
}

/**
 * Brown/red noise (−6 dB/oct): white noise integrated by a very low one-pole,
 * then high-passed at 25 Hz so it never drifts into subsonic rumble or DC.
 */
export class BrownNoise {
  private readonly integrator: OnePoleLP
  private readonly dcBlock: Biquad
  private readonly gain: number

  constructor(
    private readonly rng: Rng,
    sampleRate: number,
  ) {
    this.integrator = new OnePoleLP(sampleRate, 5)
    this.dcBlock = new Biquad(sampleRate).highpass(25)
    // Keeps the output near unit RMS independent of the sample rate.
    this.gain = Math.sqrt(sampleRate / 48000) * 12
  }

  fill(buf: Float32Array, start: number, end: number): void {
    this.rng.fillBipolar(buf, start, end, this.gain)
    this.integrator.process(buf, start, end)
    this.dcBlock.process(buf, start, end)
  }
}
