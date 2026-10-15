import { BlockGenerator } from '../block'
import { Biquad, OnePoleHP, OnePoleLP } from '../filters'
import { BrownNoise, PinkNoise, WhiteNoise } from '../noise'
import type { Rng } from '../rng'

/** Balanced: pink noise. */
export class Balanced extends BlockGenerator {
  private readonly l = new PinkNoise(this.rng.fork())
  private readonly r = new PinkNoise(this.rng.fork())

  protected chunk(left: Float32Array, right: Float32Array, start: number, end: number): void {
    this.l.fill(left, start, end)
    this.r.fill(right, start, end)
  }
}

class BrightChannel {
  private readonly noise: WhiteNoise
  private readonly lp: OnePoleLP
  private readonly hp: OnePoleHP

  constructor(rng: Rng, sampleRate: number) {
    this.noise = new WhiteNoise(rng.fork())
    this.lp = new OnePoleLP(sampleRate, 9000)
    this.hp = new OnePoleHP(sampleRate, 120)
  }

  fill(out: Float32Array, start: number, end: number): void {
    this.noise.fill(out, start, end)
    this.lp.process(out, start, end)
    this.hp.process(out, start, end)
  }
}

/** Bright: white noise with the harshest top and the lowest bass softened. */
export class Bright extends BlockGenerator {
  private readonly l = new BrightChannel(this.rng, this.sampleRate)
  private readonly r = new BrightChannel(this.rng, this.sampleRate)

  protected chunk(left: Float32Array, right: Float32Array, start: number, end: number): void {
    this.l.fill(left, start, end)
    this.r.fill(right, start, end)
  }
}

/** Dark: brown noise. */
export class Dark extends BlockGenerator {
  private readonly l = new BrownNoise(this.rng.fork(), this.sampleRate)
  private readonly r = new BrownNoise(this.rng.fork(), this.sampleRate)

  protected chunk(left: Float32Array, right: Float32Array, start: number, end: number): void {
    this.l.fill(left, start, end)
    this.r.fill(right, start, end)
  }
}

class GreyChannel {
  private readonly noise: PinkNoise
  private readonly filters: Biquad[]

  constructor(rng: Rng, sampleRate: number) {
    this.noise = new PinkNoise(rng.fork())
    // Pink noise reshaped towards a mid-level equal-loudness contour (ISO 226),
    // softened so it stays comfortable: more bass, a dip where the ear is most
    // sensitive (≈3.5 kHz), a little more air on top.
    this.filters = [
      new Biquad(sampleRate).lowshelf(160, 8),
      new Biquad(sampleRate).peaking(3500, 1, -5),
      new Biquad(sampleRate).highshelf(8000, 5),
      new Biquad(sampleRate).lowpass(15000),
      new Biquad(sampleRate).highpass(30),
    ]
  }

  fill(out: Float32Array, start: number, end: number): void {
    this.noise.fill(out, start, end)
    for (let k = 0; k < this.filters.length; k++) this.filters[k]!.process(out, start, end)
  }
}

/**
 * Grey: noise shaped to sound about equally loud at every pitch (a softened
 * inverse equal-loudness curve). Often preferred for tinnitus masking.
 */
export class Grey extends BlockGenerator {
  private readonly l = new GreyChannel(this.rng, this.sampleRate)
  private readonly r = new GreyChannel(this.rng, this.sampleRate)

  protected chunk(left: Float32Array, right: Float32Array, start: number, end: number): void {
    this.l.fill(left, start, end)
    this.r.fill(right, start, end)
  }
}
