import { BlockGenerator, boostGain, clamp01 } from '../block'
import { Biquad, OnePoleHP, OnePoleLP, Smoother, Wander } from '../filters'
import { BrownNoise, PinkNoise } from '../noise'
import type { Rng } from '../rng'
import { VoicePool } from '../voices'

const TWO_PI = 2 * Math.PI
/** Train axle positions along a carriage, in metres: two bogies of two axles. */
const AXLES = [0, 2.5, 17, 19.5]
/** Engine volume at the top of its slider, relative to the recipe's drone. */
const ENGINE_MAX_GAIN = 4
/** Bump volume at the top of its slider, relative to the recipe's clacks. */
const BUMP_MAX_GAIN = 6
/** Rail-joint spacing jitter (± share of the gap) with the randomness slider at 0 and at 1. */
const JOINT_JITTER_MIN = 0.03
const JOINT_JITTER_MAX = 0.7

class FanChannel {
  /** Set by the parent each control step. Fields, not arguments: a number passed to a
   * call V8 doesn't inline gets boxed (allocated), which the audio thread must avoid. */
  air = 1
  private readonly pink: PinkNoise
  private readonly lp1: OnePoleLP
  private readonly lp2: OnePoleLP
  private readonly whoosh: Biquad

  constructor(
    rng: Rng,
    sampleRate: number,
    private readonly tmp: Float32Array,
    /** Right channel hears the hum 90° later, so it doesn't correlate the channels. */
    readonly humOffset: number,
  ) {
    this.pink = new PinkNoise(rng.fork())
    this.lp1 = new OnePoleLP(sampleRate, 1800)
    this.lp2 = new OnePoleLP(sampleRate, 1800)
    this.whoosh = new Biquad(sampleRate).bandpass(320, 1.5)
  }

  fill(out: Float32Array, start: number, end: number): void {
    const air = this.air
    const tmp = this.tmp
    this.pink.fill(out, start, end)
    for (let i = start; i < end; i++) tmp[i] = out[i]!
    this.lp1.process(out, start, end)
    this.lp2.process(out, start, end)
    this.whoosh.process(tmp, start, end)
    for (let i = start; i < end; i++) out[i] = (out[i]! + tmp[i]! * 0.6) * air
  }
}

/**
 * Fan: low-passed airflow with a soft whoosh, pulsing gently at the
 * blade-pass rate, plus a quiet motor hum. Intensity sets the fan speed.
 */
export class Fan extends BlockGenerator {
  private readonly tmp = this.scratch()
  private readonly l = new FanChannel(this.rng, this.sampleRate, this.tmp, 0)
  private readonly r = new FanChannel(this.rng, this.sampleRate, this.tmp, Math.PI / 2)
  private readonly wobble = new Wander(this.controlRate, this.rng.fork(), 2)
  private bladePhase = 0
  private bladeInc = 0
  private air = 1

  protected control(): void {
    const intensity = this.intensity.value
    // 3 blades at 14–26 rev/s: blade-pass 42–78 Hz, with a slight speed wobble.
    this.wobble.step()
    const bladeHz = (42 + 36 * intensity) * (0.99 + 0.02 * this.wobble.value)
    this.bladeInc = (TWO_PI * bladeHz) / this.sampleRate
    this.air = 0.6 + 0.6 * intensity
  }

  protected chunk(left: Float32Array, right: Float32Array, start: number, end: number): void {
    this.l.air = this.air
    this.r.air = this.air
    this.l.fill(left, start, end)
    this.r.fill(right, start, end)
    let phase = this.bladePhase
    const inc = this.bladeInc
    const offset = this.r.humOffset
    for (let i = start; i < end; i++) {
      // Airflow pulses ±8% at the blade rate; hum = blade-pass tone + 2nd harmonic.
      const pulse = 1 + 0.08 * Math.sin(phase)
      left[i] = left[i]! * pulse + 0.05 * Math.sin(phase) + 0.025 * Math.sin(2 * phase)
      right[i] =
        right[i]! * pulse + 0.05 * Math.sin(phase + offset) + 0.025 * Math.sin(2 * (phase + offset))
      phase += inc
    }
    this.bladePhase = phase % TWO_PI
  }
}

class SteamChannel {
  /** Set by the parent each control step. Fields, not arguments: a number passed to a
   * call V8 doesn't inline gets boxed (allocated), which the audio thread must avoid. */
  surge = 1
  private readonly hiss: PinkNoise
  private readonly hp: Biquad
  private readonly lp: Biquad
  private readonly brown: BrownNoise
  private readonly rumble: OnePoleLP
  private readonly flutter: Wander
  private gain = 0

  constructor(
    rng: Rng,
    sampleRate: number,
    controlRate: number,
    private readonly tmp: Float32Array,
  ) {
    this.hiss = new PinkNoise(rng.fork())
    this.hp = new Biquad(sampleRate).highpass(1200)
    this.lp = new Biquad(sampleRate).lowpass(8000)
    this.brown = new BrownNoise(rng.fork(), sampleRate)
    this.rumble = new OnePoleLP(sampleRate, 200)
    this.flutter = new Wander(controlRate, rng.fork(), 0.4)
  }

  control(): void {
    const surge = this.surge
    this.flutter.step()
    this.gain = surge * (0.85 + 0.15 * this.flutter.value)
  }

  fill(out: Float32Array, start: number, end: number): void {
    const tmp = this.tmp
    this.hiss.fill(out, start, end)
    this.hp.process(out, start, end)
    this.lp.process(out, start, end)
    this.brown.fill(tmp, start, end)
    this.rumble.process(tmp, start, end)
    const g = this.gain
    for (let i = start; i < end; i++) out[i] = out[i]! * g + tmp[i]! * 0.12
  }
}

/** Steam: a soft, surging hiss over a faint low pipe rumble. Intensity sets the surge. */
export class Steam extends BlockGenerator {
  private readonly tmp = this.scratch()
  private readonly l = new SteamChannel(this.rng, this.sampleRate, this.controlRate, this.tmp)
  private readonly r = new SteamChannel(this.rng, this.sampleRate, this.controlRate, this.tmp)
  private readonly surge = new Wander(this.controlRate, this.rng.fork(), 4)

  protected control(): void {
    const intensity = this.intensity.value
    const depth = 0.15 + 0.35 * intensity
    this.surge.step()
    const s = 1 - depth + depth * this.surge.value
    this.l.surge = s * (0.6 + 0.6 * intensity)
    this.r.surge = s * (0.6 + 0.6 * intensity)
    this.l.control()
    this.r.control()
  }

  protected chunk(left: Float32Array, right: Float32Array, start: number, end: number): void {
    this.l.fill(left, start, end)
    this.r.fill(right, start, end)
  }
}

class CabinChannel {
  /** Set by the parent each control step. Fields, not arguments: a number passed to a
   * call V8 doesn't inline gets boxed (allocated), which the audio thread must avoid. */
  level = 1
  drone = 0
  private readonly brown: BrownNoise
  private readonly pink: PinkNoise
  private readonly lp1: OnePoleLP
  private readonly lp2: OnePoleLP
  private readonly vent: OnePoleHP
  private phase = 0
  private readonly droneInc: number

  constructor(
    rng: Rng,
    sampleRate: number,
    private readonly tmp: Float32Array,
    /** Engine drone frequency; left and right engines are slightly detuned. */
    droneHz: number,
  ) {
    this.droneInc = (TWO_PI * droneHz) / sampleRate
    this.brown = new BrownNoise(rng.fork(), sampleRate)
    this.pink = new PinkNoise(rng.fork())
    this.lp1 = new OnePoleLP(sampleRate, 500)
    this.lp2 = new OnePoleLP(sampleRate, 500)
    this.vent = new OnePoleHP(sampleRate, 900)
  }

  setCutoff(hz: number): void {
    this.lp1.setCutoff(hz)
    this.lp2.setCutoff(hz)
  }

  fill(out: Float32Array, start: number, end: number): void {
    const level = this.level
    const drone = this.drone
    const tmp = this.tmp
    this.brown.fill(out, start, end)
    this.pink.fill(tmp, start, end)
    for (let i = start; i < end; i++) out[i] = 0.7 * out[i]! + 0.3 * tmp[i]!
    this.lp1.process(out, start, end)
    this.lp2.process(out, start, end)
    this.vent.process(tmp, start, end)
    let phase = this.phase
    const inc = this.droneInc
    for (let i = start; i < end; i++) {
      const hum = Math.sin(phase) + 0.4 * Math.sin(2 * phase)
      out[i] = (out[i]! + tmp[i]! * 0.035) * level + hum * drone
      phase += inc
    }
    this.phase = phase % TWO_PI
  }
}

/**
 * Airplane: the low roar of a cabin in cruise, a little ventilation hiss, and
 * a faint engine drone with slow beating between the two engines.
 * Intensity sets how bright (close to the engines) the roar is; the engine's
 * own volume is a separate control (`engineVolume`).
 */
export class Airplane extends BlockGenerator {
  private readonly tmp = this.scratch()
  private readonly l = new CabinChannel(this.rng, this.sampleRate, this.tmp, 88)
  private readonly r = new CabinChannel(this.rng, this.sampleRate, this.tmp, 88.35)
  private readonly drift = new Wander(this.controlRate, this.rng.fork(), 8)
  private readonly engine = new Smoother(this.controlRate, 0.05, 1)
  private level = 1
  private drone = 0

  override setParam(id: string, value: number): void {
    if (id === 'engineVolume') this.engine.target = boostGain(value, ENGINE_MAX_GAIN)
  }

  protected control(): void {
    const intensity = this.intensity.value
    const cutoff = 320 + 600 * intensity
    this.l.setCutoff(cutoff)
    this.r.setCutoff(cutoff)
    this.drift.step()
    this.level = 0.9 + 0.2 * this.drift.value
    this.engine.step()
    this.drone = (0.02 + 0.02 * intensity) * this.engine.value
  }

  protected chunk(left: Float32Array, right: Float32Array, start: number, end: number): void {
    this.l.level = this.level
    this.r.level = this.level
    this.l.drone = this.drone
    this.r.drone = this.drone
    this.l.fill(left, start, end)
    this.r.fill(right, start, end)
  }
}

class CarriageChannel {
  /** Set by the parent each control step. Fields, not arguments: a number passed to a
   * call V8 doesn't inline gets boxed (allocated), which the audio thread must avoid. */
  midGain = 0
  private readonly brown: BrownNoise
  private readonly pink: PinkNoise
  private readonly lp1: OnePoleLP
  private readonly lp2: OnePoleLP
  private readonly mid: Biquad

  constructor(
    rng: Rng,
    sampleRate: number,
    private readonly tmp: Float32Array,
  ) {
    this.brown = new BrownNoise(rng.fork(), sampleRate)
    this.pink = new PinkNoise(rng.fork())
    this.lp1 = new OnePoleLP(sampleRate, 180)
    this.lp2 = new OnePoleLP(sampleRate, 180)
    this.mid = new Biquad(sampleRate).bandpass(500, 0.7)
  }

  fill(out: Float32Array, start: number, end: number): void {
    const mid = this.midGain
    const tmp = this.tmp
    this.brown.fill(out, start, end)
    this.lp1.process(out, start, end)
    this.lp2.process(out, start, end)
    this.pink.fill(tmp, start, end)
    this.mid.process(tmp, start, end)
    for (let i = start; i < end; i++) out[i] = out[i]! * 1.4 + tmp[i]! * mid
  }
}

/**
 * Train: inside a carriage. A low rumble and swaying mid-band noise, plus the
 * wheels crossing rail joints: two quick clacks from the front bogie, then two
 * from the rear. Intensity sets the speed. `bumpRandomness` loosens the rhythm
 * of the joints and `bumpVolume` sets the clacks' level against the rumble.
 */
export class Train extends BlockGenerator {
  private readonly tmp = this.scratch()
  private readonly l = new CarriageChannel(this.rng, this.sampleRate, this.tmp)
  private readonly r = new CarriageChannel(this.rng, this.sampleRate, this.tmp)
  private readonly sway = new Wander(this.controlRate, this.rng.fork(), 2)
  private readonly wheels = new VoicePool(this.sampleRate, this.rng.fork(), 48)
  /** Samples until the next rail joint. */
  private toJoint = 0
  private speed = 25
  private mid = 0.25
  /** Rail-gap jitter as a share of the gap, either way. */
  private jitter = JOINT_JITTER_MIN
  private bumpGain = 1

  override setParam(id: string, value: number): void {
    if (id === 'bumpRandomness') {
      this.jitter = JOINT_JITTER_MIN + (JOINT_JITTER_MAX - JOINT_JITTER_MIN) * clamp01(value)
    } else if (id === 'bumpVolume') {
      this.bumpGain = boostGain(value, BUMP_MAX_GAIN)
    }
  }

  protected control(): void {
    const intensity = this.intensity.value
    this.speed = 16 + 18 * intensity // metres per second
    this.sway.step()
    this.mid = 0.25 * (0.8 + 0.4 * this.sway.value) * (0.7 + 0.6 * intensity)
  }

  protected chunk(left: Float32Array, right: Float32Array, start: number, end: number): void {
    this.l.midGain = this.mid
    this.r.midGain = this.mid
    this.l.fill(left, start, end)
    this.r.fill(right, start, end)
    const len = end - start
    this.toJoint -= len
    while (this.toJoint < 0) {
      const at = len + this.toJoint
      this.joint(at)
      // 25 m rails, with a little irregularity (a lot, if asked).
      this.toJoint +=
        (25 / this.speed) * this.sampleRate * this.rng.range(1 - this.jitter, 1 + this.jitter)
    }
    this.wheels.process(left, right, start, end)
  }

  /** Front bogie (two axles 2.5 m apart), then the rear bogie 17 m behind. */
  private joint(at: number): void {
    // A silent voice would never reach its decay floor, and would hold its slot forever.
    if (this.bumpGain === 0) return
    const sr = this.sampleRate
    const v = this.speed
    const rng = this.rng
    for (let k = 0; k < AXLES.length; k++) {
      const delay = at + (AXLES[k]! / v) * sr
      const pan = k < 2 ? -0.15 : 0.15
      const amp = rng.range(0.5, 0.9) * (k < 2 ? 1 : 0.8) * this.bumpGain
      this.wheels.burst(delay, rng.range(120, 220), 1.5, amp, 0.002, rng.range(0.08, 0.13), pan)
      this.wheels.burst(delay, rng.range(1500, 3000), 1, amp * 0.18, 0, 0.015, pan)
    }
  }
}
