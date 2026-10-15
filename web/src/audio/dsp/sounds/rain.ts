import { BlockGenerator } from '../block'
import { Biquad, OnePoleLP, Wander } from '../filters'
import { BrownNoise, PinkNoise } from '../noise'
import type { Rng } from '../rng'
import { PoissonClock, VoicePool } from '../voices'

class RainChannel {
  /** Set by the parent each control step. Fields, not arguments: a number passed to a
   * call V8 doesn't inline gets boxed (allocated), which the audio thread must avoid. */
  bedGain = 0
  private readonly hiss: PinkNoise
  private readonly hp: Biquad
  private readonly lp: Biquad
  private readonly body: BrownNoise
  private readonly bodyLp: OnePoleLP
  private readonly tmp: Float32Array

  constructor(rng: Rng, sampleRate: number, tmp: Float32Array) {
    this.hiss = new PinkNoise(rng.fork())
    this.hp = new Biquad(sampleRate).highpass(500)
    this.lp = new Biquad(sampleRate).lowpass(10000)
    this.body = new BrownNoise(rng.fork(), sampleRate)
    this.bodyLp = new OnePoleLP(sampleRate, 300)
    this.tmp = tmp
  }

  fill(out: Float32Array, start: number, end: number): void {
    const bedGain = this.bedGain
    const tmp = this.tmp
    this.hiss.fill(out, start, end)
    this.hp.process(out, start, end)
    this.lp.process(out, start, end)
    this.body.fill(tmp, start, end)
    this.bodyLp.process(tmp, start, end)
    for (let i = start; i < end; i++) out[i] = out[i]! * bedGain + tmp[i]! * 0.15
  }
}

/** Rain: a hissing pink bed plus a Poisson stream of drops (filtered ticks and bubble pings). */
export class Rain extends BlockGenerator {
  private readonly tmp = this.scratch()
  private readonly l = new RainChannel(this.rng, this.sampleRate, this.tmp)
  private readonly r = new RainChannel(this.rng, this.sampleRate, this.tmp)
  private readonly drops = new VoicePool(this.sampleRate, this.rng.fork(), 48)
  private readonly wander = new Wander(this.controlRate, this.rng.fork(), 3)
  private readonly clock = new PoissonClock(this.rng.fork(), this.sampleRate)
  private bedGain = 0
  private dropRate = 0

  protected control(): void {
    const intensity = this.intensity.value
    this.wander.step()
    this.bedGain = (0.5 + 0.8 * intensity) * (0.85 + 0.3 * this.wander.value)
    this.dropRate = 40 + 900 * Math.pow(intensity, 1.5)
  }

  protected chunk(left: Float32Array, right: Float32Array, start: number, end: number): void {
    this.l.bedGain = this.bedGain
    this.r.bedGain = this.bedGain
    this.l.fill(left, start, end)
    this.r.fill(right, start, end)
    const rng = this.rng
    const events = this.clock.tick(end - start, this.dropRate)
    for (let k = 0; k < events; k++) {
      const at = this.clock.offsets[k]!
      if (rng.next() < 0.85) {
        this.drops.burst(
          at,
          rng.logRange(1500, 8000),
          rng.range(1.5, 5),
          rng.logRange(0.15, 1.5),
          0.0005,
          rng.logRange(0.008, 0.04),
          rng.bipolar() * 0.9,
        )
      } else {
        this.drops.chirp(
          at,
          rng.logRange(1200, 4000),
          1.3,
          rng.logRange(0.02, 0.12),
          0.001,
          rng.range(0.02, 0.06),
          rng.bipolar() * 0.9,
        )
      }
    }
    this.drops.process(left, right, start, end)
  }
}
