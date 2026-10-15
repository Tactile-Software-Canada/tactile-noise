import { BlockGenerator } from '../block'
import { Biquad, OnePoleLP } from '../filters'
import { BrownNoise, PinkNoise } from '../noise'
import type { Rng } from '../rng'

/** e^−3: where the wash would otherwise still be when the next wave starts. */
const TAIL = Math.exp(-3)

/**
 * One train of ocean waves: slow build, crash, long wash. Output in [0, 1].
 * The wash is rescaled to reach exactly 0 at the end of each wave, so the next
 * wave (with a new random size) starts from silence instead of jumping down,
 * which used to make an audible pop at every wave.
 */
class WaveTrain {
  private phase: number
  private inc = 0
  private amp = 1
  /** Envelope value in [0, 1]; updated by {@link step}. */
  value = 0

  constructor(
    private readonly controlRate: number,
    private readonly rng: Rng,
    private readonly minPeriod: number,
    private readonly maxPeriod: number,
  ) {
    this.phase = rng.next()
    this.newWave()
  }

  step(speed: number): void {
    this.phase += this.inc * speed
    if (this.phase >= 1) {
      this.phase -= 1
      this.newWave()
    }
    const p = this.phase
    const shape = p < 0.4 ? Math.pow(p / 0.4, 2.5) : (Math.exp(-(p - 0.4) * 5) - TAIL) / (1 - TAIL)
    this.value = shape * this.amp
  }

  private newWave(): void {
    this.inc = 1 / (this.rng.range(this.minPeriod, this.maxPeriod) * this.controlRate)
    this.amp = this.rng.range(0.55, 1)
  }
}

class OceanChannel {
  private readonly brown: BrownNoise
  private readonly pink: PinkNoise
  private readonly lp1: OnePoleLP
  private readonly lp2: OnePoleLP
  private readonly foamHp: Biquad
  private readonly rumble: OnePoleLP
  /**
   * Removes sub-bass below ~55 Hz. Brown noise surges there at every wave
   * crest; phone speakers can't play it, and their protection limiting or
   * distortion on each surge was heard as subtle popping.
   */
  private readonly subsonic1: Biquad
  private readonly subsonic2: Biquad
  /** Targets for the end of the current chunk; ramped to sample by sample. */
  gain = 0
  foam = 0
  private lastGain = 0
  private lastFoam = 0

  constructor(
    rng: Rng,
    sampleRate: number,
    private readonly b: Float32Array,
    private readonly p: Float32Array,
    private readonly s: Float32Array,
  ) {
    this.brown = new BrownNoise(rng.fork(), sampleRate)
    this.pink = new PinkNoise(rng.fork())
    this.lp1 = new OnePoleLP(sampleRate, 500)
    this.lp2 = new OnePoleLP(sampleRate, 500)
    this.foamHp = new Biquad(sampleRate).highpass(1800)
    this.rumble = new OnePoleLP(sampleRate, 150)
    this.subsonic1 = new Biquad(sampleRate).highpass(55)
    this.subsonic2 = new Biquad(sampleRate).highpass(55)
  }

  setEnvelope(e: number, depth: number): void {
    const cutoff = 200 + 2800 * Math.pow(e, 1.5) * depth
    this.lp1.setCutoff(cutoff)
    this.lp2.setCutoff(cutoff)
    this.gain = 0.25 + 0.75 * e * depth
    this.foam = Math.pow(e, 3) * 0.35 * depth
  }

  fill(out: Float32Array, start: number, end: number): void {
    const { b, p, s } = this
    this.brown.fill(b, start, end)
    this.pink.fill(p, start, end)
    // Surf: low-passed brown/pink mix.
    for (let i = start; i < end; i++) s[i] = 0.75 * b[i]! + 0.25 * p[i]!
    this.lp1.process(s, start, end)
    this.lp2.process(s, start, end)
    // Foam: high-passed pink (in place: p is free after the surf mix).
    this.foamHp.process(p, start, end)
    // Rumble: low-passed brown (in place).
    this.rumble.process(b, start, end)
    // Linear ramps from the previous chunk's gains: no steps, so no zipper clicks.
    const n = end - start
    let gain = this.lastGain
    let foam = this.lastFoam
    const dGain = (this.gain - gain) / n
    const dFoam = (this.foam - foam) / n
    for (let i = start; i < end; i++) {
      gain += dGain
      foam += dFoam
      out[i] = s[i]! * gain + p[i]! * foam + b[i]! * 0.3
    }
    this.lastGain = this.gain
    this.lastFoam = this.foam
    this.subsonic1.process(out, start, end)
    this.subsonic2.process(out, start, end)
  }
}

/** Ocean: low-passed brown/pink surf whose level and brightness follow wave envelopes. */
export class Ocean extends BlockGenerator {
  private readonly big = new WaveTrain(this.controlRate, this.rng.fork(), 7, 12)
  private readonly small = new WaveTrain(this.controlRate, this.rng.fork(), 4, 7)
  /** Envelope history so the right channel hears each wave slightly later. */
  private readonly history = new Float32Array(Math.round(0.35 * this.controlRate))
  private historyPos = 0
  private filled = false
  private readonly bufs = [this.scratch(), this.scratch(), this.scratch()] as const
  private readonly l = new OceanChannel(this.rng, this.sampleRate, ...this.bufs)
  private readonly r = new OceanChannel(this.rng, this.sampleRate, ...this.bufs)

  protected control(): void {
    const intensity = this.intensity.value
    const speed = 0.8 + 0.4 * intensity
    const depth = 0.6 + 0.4 * intensity
    this.big.step(speed)
    this.small.step(speed)
    const e1 = this.big.value
    const e2 = this.small.value
    const env = 1 - (1 - e1) * (1 - 0.5 * e2)
    this.history[this.historyPos] = env
    this.historyPos = (this.historyPos + 1) % this.history.length
    this.l.setEnvelope(env, depth)
    // Until the history has filled (first 0.35 s), the right channel uses the
    // current value rather than the zeros it was created with.
    const delayed = this.filled ? this.history[this.historyPos]! : env
    if (this.historyPos === 0) this.filled = true
    this.r.setEnvelope(delayed, depth)
  }

  protected chunk(left: Float32Array, right: Float32Array, start: number, end: number): void {
    this.l.fill(left, start, end)
    this.r.fill(right, start, end)
  }
}
