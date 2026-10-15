import { BlockGenerator } from '../block'
import { Biquad, OnePoleLP, Wander } from '../filters'
import { BrownNoise, PinkNoise } from '../noise'
import type { Rng } from '../rng'
import { PoissonClock, VoicePool } from '../voices'

class FireChannel {
  /** Set by the parent each control step. Fields, not arguments: a number passed to a
   * call V8 doesn't inline gets boxed (allocated), which the audio thread must avoid. */
  flame = 1
  private readonly brown: BrownNoise
  private readonly pink: PinkNoise
  private readonly lp1: OnePoleLP
  private readonly lp2: OnePoleLP
  private readonly hissHp: Biquad
  private readonly hissLp: Biquad

  constructor(
    rng: Rng,
    sampleRate: number,
    private readonly tmp: Float32Array,
  ) {
    this.brown = new BrownNoise(rng.fork(), sampleRate)
    this.pink = new PinkNoise(rng.fork())
    this.lp1 = new OnePoleLP(sampleRate, 180)
    this.lp2 = new OnePoleLP(sampleRate, 180)
    this.hissHp = new Biquad(sampleRate).highpass(1500)
    this.hissLp = new Biquad(sampleRate).lowpass(7000)
  }

  fill(out: Float32Array, start: number, end: number): void {
    const flame = this.flame
    const tmp = this.tmp
    this.brown.fill(out, start, end)
    this.lp1.process(out, start, end)
    this.lp2.process(out, start, end)
    this.pink.fill(tmp, start, end)
    this.hissHp.process(tmp, start, end)
    this.hissLp.process(tmp, start, end)
    for (let i = start; i < end; i++) out[i] = (out[i]! * 1.2 + tmp[i]! * 0.08) * flame
  }
}

/** Fire: a flickering low rumble and soft hiss, with clustered crackles and occasional pops. */
export class Fire extends BlockGenerator {
  private readonly tmp = this.scratch()
  private readonly l = new FireChannel(this.rng, this.sampleRate, this.tmp)
  private readonly r = new FireChannel(this.rng, this.sampleRate, this.tmp)
  private readonly flicker = new Wander(this.controlRate, this.rng.fork(), 0.7)
  private readonly sparks = new VoicePool(this.sampleRate, this.rng.fork(), 64)
  private readonly crackleClock = new PoissonClock(this.rng.fork(), this.sampleRate)
  private readonly popClock = new PoissonClock(this.rng.fork(), this.sampleRate)
  private flame = 1
  private crackleRate = 0
  private popRate = 0

  protected control(): void {
    const intensity = this.intensity.value
    this.flicker.step()
    this.flame = 0.6 + 0.4 * this.flicker.value
    this.crackleRate = 4 + 30 * intensity
    this.popRate = 0.2 + 0.8 * intensity
  }

  protected chunk(left: Float32Array, right: Float32Array, start: number, end: number): void {
    this.l.flame = this.flame
    this.r.flame = this.flame
    this.l.fill(left, start, end)
    this.r.fill(right, start, end)
    const rng = this.rng
    const len = end - start
    const crackles = this.crackleClock.tick(len, this.crackleRate)
    for (let k = 0; k < crackles; k++) {
      const at = this.crackleClock.offsets[k]!
      const pan = rng.bipolar() * 0.8
      const clicks = 1 + Math.floor(rng.next() * 6)
      for (let c = 0; c < clicks; c++) {
        this.sparks.burst(
          at + rng.range(0, 0.06) * this.sampleRate,
          rng.logRange(2000, 9000),
          0.7,
          rng.logRange(0.04, 0.45),
          0,
          rng.logRange(0.002, 0.012),
          pan + rng.bipolar() * 0.1,
        )
      }
    }
    const pops = this.popClock.tick(len, this.popRate)
    for (let k = 0; k < pops; k++) {
      const at = this.popClock.offsets[k]!
      const pan = rng.bipolar() * 0.7
      this.sparks.burst(
        at,
        rng.logRange(250, 900),
        rng.range(3, 8),
        rng.logRange(0.2, 0.6),
        0,
        rng.range(0.03, 0.08),
        pan,
      )
      this.sparks.burst(at, 4000, 0.7, 0.35, 0, 0.004, pan)
    }
    this.sparks.process(left, right, start, end)
  }
}
