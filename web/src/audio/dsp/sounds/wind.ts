import { BlockGenerator } from '../block'
import { Biquad, OnePoleLP, Wander } from '../filters'
import { BrownNoise, PinkNoise } from '../noise'
import type { Rng } from '../rng'

class WindChannel {
  /** Set by the parent each control step. Fields, not arguments: a number passed to a
   * call V8 doesn't inline gets boxed (allocated), which the audio thread must avoid. */
  gust = 0
  intensity = 0
  private readonly pink: PinkNoise
  private readonly brown: BrownNoise
  private readonly body: Biquad
  private readonly whistle: Biquad
  private readonly rumble: OnePoleLP
  private readonly drift: Wander
  private readonly whistleDrift: Wander
  private bodyGain = 0
  private whistleGain = 0
  private rumbleGain = 0

  constructor(
    rng: Rng,
    sampleRate: number,
    controlRate: number,
    private readonly w: Float32Array,
    private readonly b: Float32Array,
  ) {
    this.pink = new PinkNoise(rng.fork())
    this.brown = new BrownNoise(rng.fork(), sampleRate)
    this.body = new Biquad(sampleRate)
    this.whistle = new Biquad(sampleRate)
    this.rumble = new OnePoleLP(sampleRate, 120)
    this.drift = new Wander(controlRate, rng.fork(), 4)
    this.whistleDrift = new Wander(controlRate, rng.fork(), 6)
  }

  /** `gust` in [0, 1]: how hard the wind is blowing right now. */
  control(): void {
    const gust = this.gust
    const intensity = this.intensity
    const strength = 0.5 + 0.6 * intensity
    this.drift.step()
    const centre = 220 + 900 * (0.3 * this.drift.value + 0.7 * gust) * strength
    this.body.bandpass(centre, 1.2 + 2 * gust)
    this.whistleDrift.step()
    this.whistle.bandpass(650 + 900 * this.whistleDrift.value, 14)
    this.bodyGain = 0.3 + 0.9 * gust * strength
    this.whistleGain = Math.pow(gust, 3) * 0.35 * intensity
    this.rumbleGain = (0.2 + 0.5 * gust) * strength
  }

  fill(out: Float32Array, start: number, end: number): void {
    const { w, b } = this
    this.pink.fill(out, start, end)
    for (let i = start; i < end; i++) w[i] = out[i]!
    this.body.process(out, start, end)
    this.whistle.process(w, start, end)
    this.brown.fill(b, start, end)
    this.rumble.process(b, start, end)
    const bg = this.bodyGain
    const wg = this.whistleGain
    const rg = this.rumbleGain
    for (let i = start; i < end; i++) out[i] = out[i]! * bg + w[i]! * wg + b[i]! * rg
  }
}

/**
 * Wind: pink noise through a resonant band-pass whose centre and level follow
 * slow gusts, a low rumble, and a faint whistle at the strongest gusts.
 */
export class Wind extends BlockGenerator {
  private readonly slowGust = new Wander(this.controlRate, this.rng.fork(), 3.5)
  private readonly fastGust = new Wander(this.controlRate, this.rng.fork(), 0.9)
  private readonly bufs = [this.scratch(), this.scratch()] as const
  private readonly l = new WindChannel(this.rng, this.sampleRate, this.controlRate, ...this.bufs)
  private readonly r = new WindChannel(this.rng, this.sampleRate, this.controlRate, ...this.bufs)

  protected control(): void {
    const intensity = this.intensity.value
    this.slowGust.step()
    this.fastGust.step()
    const gust = Math.min(1, 0.75 * this.slowGust.value + 0.35 * this.fastGust.value)
    this.l.gust = gust
    this.r.gust = gust
    this.l.intensity = intensity
    this.r.intensity = intensity
    this.l.control()
    this.r.control()
  }

  protected chunk(left: Float32Array, right: Float32Array, start: number, end: number): void {
    this.l.fill(left, start, end)
    this.r.fill(right, start, end)
  }
}
