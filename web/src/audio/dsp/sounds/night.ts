import { BlockGenerator } from '../block'
import { Biquad, OnePoleLP, Smoother, Wander } from '../filters'
import { PinkNoise } from '../noise'
import type { Rng } from '../rng'

const MAX_CRICKETS = 6

/**
 * One cricket: chirps made of 3–7 short sine pulses (≈4–5 kHz carrier,
 * 25–45 pulses per second), repeated every 0.4–1.3 s with some jitter.
 */
class Cricket {
  private readonly inc: number
  private readonly pulsePeriod: number
  private readonly gainL: number
  private readonly gainR: number
  private phase = 0
  private t = 0
  private pulses = 0
  private interval = 0
  /** Fades the cricket in and out as intensity changes how many are singing. */
  readonly level: Smoother

  constructor(
    private readonly rng: Rng,
    private readonly sampleRate: number,
    controlRate: number,
  ) {
    const freq = rng.range(3800, 5200)
    this.inc = (2 * Math.PI * freq) / sampleRate
    this.pulsePeriod = sampleRate / rng.range(25, 45)
    const amp = rng.logRange(0.05, 0.2)
    const angle = ((rng.bipolar() * 0.9 + 1) * Math.PI) / 4
    this.gainL = Math.cos(angle) * amp
    this.gainR = Math.sin(angle) * amp
    this.level = new Smoother(controlRate, 1.5, 0)
    this.t = Math.floor(rng.next() * sampleRate)
    this.newChirp()
  }

  add(left: Float32Array, right: Float32Array, start: number, end: number): void {
    const level = this.level.value
    if (level < 0.001) return
    const gl = this.gainL * level
    const gr = this.gainR * level
    const period = this.pulsePeriod
    const duty = 0.45
    let chirpLength = this.pulses * period
    let t = this.t
    let phase = this.phase
    const inc = this.inc
    for (let i = start; i < end; i++) {
      if (t < chirpLength) {
        const u = (t % period) / period
        if (u < duty) {
          const e = Math.sin((Math.PI * u) / duty)
          const s = Math.sin(phase) * e * e
          left[i] = left[i]! + s * gl
          right[i] = right[i]! + s * gr
        }
      }
      phase += inc
      if (++t >= this.interval) {
        t = 0
        this.newChirp()
        chirpLength = this.pulses * period
      }
    }
    this.t = t
    this.phase = phase % (2 * Math.PI)
  }

  private newChirp(): void {
    this.pulses = 3 + Math.floor(this.rng.next() * 5)
    this.interval = Math.floor(this.rng.range(0.4, 1.3) * this.sampleRate)
  }
}

class AirChannel {
  /** Set by the parent each control step. Fields, not arguments: a number passed to a
   * call V8 doesn't inline gets boxed (allocated), which the audio thread must avoid. */
  intensity = 0
  private readonly pink: PinkNoise
  private readonly lp: OnePoleLP
  private readonly lp2: OnePoleLP
  private readonly chorus: Biquad
  private readonly chorusDrift: Wander
  private chorusGain = 0

  constructor(
    rng: Rng,
    sampleRate: number,
    controlRate: number,
    private readonly tmp: Float32Array,
  ) {
    this.pink = new PinkNoise(rng.fork())
    this.lp = new OnePoleLP(sampleRate, 600)
    this.lp2 = new OnePoleLP(sampleRate, 600)
    this.chorus = new Biquad(sampleRate).bandpass(6500, 1.2)
    this.chorusDrift = new Wander(controlRate, rng.fork(), 5)
  }

  control(): void {
    const intensity = this.intensity
    this.chorusDrift.step()
    this.chorusGain = (0.02 + 0.03 * this.chorusDrift.value) * (0.5 + intensity)
  }

  fill(out: Float32Array, start: number, end: number): void {
    const tmp = this.tmp
    this.pink.fill(out, start, end)
    for (let i = start; i < end; i++) tmp[i] = out[i]!
    this.lp.process(out, start, end)
    this.lp2.process(out, start, end)
    this.chorus.process(tmp, start, end)
    const cg = this.chorusGain
    for (let i = start; i < end; i++) out[i] = out[i]! * 0.35 + tmp[i]! * cg
  }
}

/**
 * Night: a still, dark air bed with a faint distant insect chorus, plus a few
 * crickets. Intensity sets how many crickets are singing (1–6).
 */
export class Night extends BlockGenerator {
  private readonly tmp = this.scratch()
  private readonly l = new AirChannel(this.rng, this.sampleRate, this.controlRate, this.tmp)
  private readonly r = new AirChannel(this.rng, this.sampleRate, this.controlRate, this.tmp)
  private readonly crickets = Array.from(
    { length: MAX_CRICKETS },
    () => new Cricket(this.rng.fork(), this.sampleRate, this.controlRate),
  )

  protected control(): void {
    const intensity = this.intensity.value
    this.l.intensity = intensity
    this.r.intensity = intensity
    this.l.control()
    this.r.control()
    const singing = 1 + intensity * (MAX_CRICKETS - 1)
    for (let k = 0; k < MAX_CRICKETS; k++) {
      const c = this.crickets[k]!
      c.level.target = Math.min(1, Math.max(0, singing - k))
      c.level.step()
    }
  }

  protected chunk(left: Float32Array, right: Float32Array, start: number, end: number): void {
    this.l.fill(left, start, end)
    this.r.fill(right, start, end)
    for (let k = 0; k < MAX_CRICKETS; k++) this.crickets[k]!.add(left, right, start, end)
  }
}
