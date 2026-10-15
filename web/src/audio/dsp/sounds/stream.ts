import { BlockGenerator } from '../block'
import { Biquad, Wander } from '../filters'
import { PinkNoise } from '../noise'
import type { Rng } from '../rng'
import { PoissonClock, VoicePool } from '../voices'

class StreamChannel {
  /** Set by the parent each control step. Fields, not arguments: a number passed to a
   * call V8 doesn't inline gets boxed (allocated), which the audio thread must avoid. */
  intensity = 0
  private readonly noise: PinkNoise
  private readonly hp: Biquad
  private readonly lp: Biquad
  private readonly wander: Wander
  gain = 1

  constructor(rng: Rng, sampleRate: number, controlRate: number) {
    this.noise = new PinkNoise(rng.fork())
    this.hp = new Biquad(sampleRate).highpass(300)
    this.lp = new Biquad(sampleRate).lowpass(3500)
    this.wander = new Wander(controlRate, rng.fork(), 0.25)
  }

  control(): void {
    const intensity = this.intensity
    this.wander.step()
    this.gain = (0.7 + 0.3 * this.wander.value) * (0.7 + 0.5 * intensity)
  }

  fill(out: Float32Array, start: number, end: number): void {
    this.noise.fill(out, start, end)
    this.hp.process(out, start, end)
    this.lp.process(out, start, end)
    const g = this.gain
    for (let i = start; i < end; i++) out[i] = out[i]! * g
  }
}

/** Stream: a mid-band babble bed plus many rising bubble chirps and low gurgles. */
export class Stream extends BlockGenerator {
  private readonly l = new StreamChannel(this.rng, this.sampleRate, this.controlRate)
  private readonly r = new StreamChannel(this.rng, this.sampleRate, this.controlRate)
  private readonly bubbles = new VoicePool(this.sampleRate, this.rng.fork(), 64)
  private readonly bubbleClock = new PoissonClock(this.rng.fork(), this.sampleRate)
  private readonly gurgleClock = new PoissonClock(this.rng.fork(), this.sampleRate)
  private bubbleRate = 0
  private gurgleRate = 0

  protected control(): void {
    const intensity = this.intensity.value
    this.l.intensity = intensity
    this.r.intensity = intensity
    this.l.control()
    this.r.control()
    this.bubbleRate = 80 + 300 * intensity
    this.gurgleRate = 15 + 40 * intensity
  }

  protected chunk(left: Float32Array, right: Float32Array, start: number, end: number): void {
    this.l.fill(left, start, end)
    this.r.fill(right, start, end)
    const rng = this.rng
    const len = end - start
    const bubbles = this.bubbleClock.tick(len, this.bubbleRate)
    for (let k = 0; k < bubbles; k++) {
      this.bubbles.chirp(
        this.bubbleClock.offsets[k]!,
        rng.logRange(350, 1600),
        rng.range(1.15, 1.6),
        rng.logRange(0.03, 0.25),
        0.002,
        rng.logRange(0.015, 0.07),
        rng.bipolar() * 0.8,
      )
    }
    const gurgles = this.gurgleClock.tick(len, this.gurgleRate)
    for (let k = 0; k < gurgles; k++) {
      this.bubbles.burst(
        this.gurgleClock.offsets[k]!,
        rng.logRange(200, 800),
        8,
        rng.logRange(0.2, 1),
        0.005,
        rng.range(0.04, 0.12),
        rng.bipolar() * 0.8,
      )
    }
    this.bubbles.process(left, right, start, end)
  }
}
