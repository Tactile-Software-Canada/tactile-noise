import { describe, expect, it } from 'vitest'
import {
  TARGET_LUFS,
  TRIMS,
  createGenerator,
  softClip,
  type SoundId,
} from '../../src/audio/dsp/generators'
import { Biquad } from '../../src/audio/dsp/filters'
import { Rng } from '../../src/audio/dsp/rng'
import {
  SR,
  bandCentres,
  correlation,
  lufs,
  peakDb,
  render,
  slopeDbPerOct,
  thirdOctaveDensityDb,
} from './analysis'

const SOUNDS = Object.keys(TRIMS) as SoundId[]

describe('Rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = new Rng(1)
    const b = new Rng(1)
    const c = new Rng(2)
    const seqA = Array.from({ length: 5 }, () => a.nextU32())
    expect(Array.from({ length: 5 }, () => b.nextU32())).toEqual(seqA)
    expect(Array.from({ length: 5 }, () => c.nextU32())).not.toEqual(seqA)
  })

  it('fillBipolar produces the same sequence as bipolar()', () => {
    const a = new Rng(42)
    const b = new Rng(42)
    const buf = new Float32Array(1000)
    a.fillBipolar(buf, 0, 1000)
    const expected = Float32Array.from({ length: 1000 }, () => b.bipolar())
    expect(buf).toEqual(expected)
    // And the state carries over between calls.
    a.fillBipolar(buf, 0, 1)
    expect(buf[0]).toBe(Math.fround(b.bipolar()))
  })

  it('stays within range and is roughly uniform', () => {
    const rng = new Rng(7)
    let sum = 0
    for (let i = 0; i < 100_000; i++) {
      const v = rng.bipolar()
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThan(1)
      sum += v
    }
    expect(Math.abs(sum / 100_000)).toBeLessThan(0.01)
  })
})

describe.each(SOUNDS)('%s', (id) => {
  const r = render(id, 20)

  it('renders the same audio for the same seed', () => {
    const again = render(id, 1)
    expect(again.left).toEqual(r.left.subarray(0, again.left.length))
  })

  it('produces finite samples', () => {
    expect(r.left.every(Number.isFinite) && r.right.every(Number.isFinite)).toBe(true)
  })

  it(`is normalised to ${TARGET_LUFS} LUFS (±1 LU) at default intensity`, () => {
    expect(Math.abs(lufs(r) - TARGET_LUFS)).toBeLessThan(1)
  })

  it('never clips, at any intensity', () => {
    for (const intensity of [0, 0.5, 1]) {
      expect(peakDb(render(id, 10, intensity, 99))).toBeLessThan(-0.1)
    }
  })

  it('stays within ±7 LU of the target across the intensity range', () => {
    for (const intensity of [0, 1]) {
      expect(Math.abs(lufs(render(id, 10, intensity)) - TARGET_LUFS)).toBeLessThan(7)
    }
  })

  it('has decorrelated left and right channels (wide, not mono)', () => {
    expect(Math.abs(correlation(r.left, r.right))).toBeLessThan(0.35)
  })

  it('has no DC offset', () => {
    const mean = r.left.reduce((a, b) => a + b, 0) / r.left.length
    expect(Math.abs(mean)).toBeLessThan(0.01)
  })
})

describe('noise colours', () => {
  const centres = bandCentres(100, 8000)
  const slope = (id: SoundId) =>
    slopeDbPerOct(centres, thirdOctaveDensityDb(render(id, 20).left, centres))

  it('Balanced is pink (−3 dB/oct)', () => expect(slope('balanced')).toBeCloseTo(-3, 0))
  it('Dark is brown (−6 dB/oct)', () => expect(slope('dark')).toBeCloseTo(-6, 0))
  it('Bright is near white (flat ±1 dB/oct)', () =>
    expect(Math.abs(slope('bright'))).toBeLessThan(1))

  it('Grey lifts the bass and dips the ear-sensitive 3–4 kHz band (relative to pink)', () => {
    const bands = [63, 1000, 3150, 10000]
    // Third-octave band power: density + bandwidth, so pink noise reads flat.
    const power = thirdOctaveDensityDb(render('grey', 20).left, bands).map(
      (db, i) => db + 10 * Math.log10(bands[i]!),
    )
    const [low, , presence, air] = power.map((p) => p - power[1]!) as [
      number,
      number,
      number,
      number,
    ]
    expect(low).toBeGreaterThan(5)
    expect(presence).toBeLessThan(-2)
    expect(air).toBeGreaterThan(presence + 3)
  })
})

describe('intensity', () => {
  it.each(SOUNDS.filter((id) => !['balanced', 'bright', 'dark', 'grey'].includes(id)))(
    '%s gets louder with intensity',
    (id) => {
      expect(lufs(render(id, 10, 1))).toBeGreaterThan(lufs(render(id, 10, 0)))
    },
  )

  it('changes smoothly instead of jumping', () => {
    const gen = createGenerator('rain', SR, 1, 0)
    const l = new Float32Array(128)
    const r = new Float32Array(128)
    for (let i = 0; i < 400; i++) gen.render(l, r)
    gen.setIntensity(1)
    gen.render(l, r)
    const rms = Math.sqrt(l.reduce((a, b) => a + b * b, 0) / l.length)
    // One block after the change the bed has barely moved (time constant 0.5 s).
    expect(rms).toBeLessThan(0.2)
  })
})

/**
 * Click detector: a click or pop is an isolated spike in the signal's curvature
 * (second difference) compared with its local RMS. Sounds made of smooth noise
 * must never have one; sounds with deliberate transients (rain drops, crackles,
 * clacks, bubbles) are excluded.
 */
function worstClick(x: Float32Array): number {
  const W = 2400
  let acc = 0
  let worst = 0
  const d2 = new Float32Array(x.length)
  for (let i = 2; i < x.length; i++) d2[i] = x[i]! - 2 * x[i - 1]! + x[i - 2]!
  for (let i = 0; i < x.length; i++) {
    acc += d2[i]! * d2[i]!
    if (i >= W) acc -= d2[i - W]! * d2[i - W]!
    if (i > W) worst = Math.max(worst, Math.abs(d2[i]!) / (Math.sqrt(acc / W) + 1e-9))
  }
  return worst
}

describe('no clicks or pops', () => {
  const SMOOTH: SoundId[] = [
    'balanced',
    'bright',
    'dark',
    'grey',
    'ocean',
    'wind',
    'fan',
    'steam',
    'airplane',
  ]
  it.each(SMOOTH)('%s', (id) => {
    for (const intensity of [0.5, 1]) {
      // 60 s covers several Ocean waves (each restart used to pop).
      const r = render(id, 60, intensity, 7)
      expect(Math.max(worstClick(r.left), worstClick(r.right))).toBeLessThan(8)
    }
  })
})

describe('sub-bass', () => {
  // Phone speakers can't play below ~60 Hz; surges there (Ocean's wave crests)
  // make them distort, which was heard as popping. Keep it at or below the
  // steady level of Dark (brown) noise.
  it('Ocean stays below Dark noise in the sub-60 Hz band', () => {
    const sub60Peak = (id: SoundId) => {
      const y = render(id, 60, 1, 7).left.slice()
      new Biquad(SR).lowpass(60).process(y, 0, y.length)
      new Biquad(SR).lowpass(60).process(y, 0, y.length)
      let worst = 0
      for (let f = 0; f + 12000 <= y.length; f += 12000) {
        let sum = 0
        for (let i = f; i < f + 12000; i++) sum += y[i]! * y[i]!
        worst = Math.max(worst, sum / 12000)
      }
      return 10 * Math.log10(worst)
    }
    expect(sub60Peak('ocean')).toBeLessThan(sub60Peak('dark') - 3)
  })
})

describe('tone (warmth) inside the generator', () => {
  // Tone runs before the soft clip, so even full boosts can't reach the output
  // limiter (its hard clamping used to be heard as popping at high volume).
  it.each(SOUNDS)('%s stays at or below −1 dBFS at both tone extremes', (id) => {
    for (const tone of [-1, 1]) {
      const g = createGenerator(id, SR, 7, 1, tone)
      const l = new Float32Array(128)
      const r = new Float32Array(128)
      let peak = 0
      for (let b = 0; b < (20 * SR) / 128; b++) {
        g.render(l, r)
        for (let i = 0; i < 128; i++) peak = Math.max(peak, Math.abs(l[i]!), Math.abs(r[i]!))
      }
      expect(20 * Math.log10(peak)).toBeLessThanOrEqual(-1)
    }
  })

  it('changes smoothly (no click when the slider moves)', () => {
    const g = createGenerator('balanced', SR, 7, 0.5, 0)
    const l = new Float32Array(128)
    const r = new Float32Array(128)
    for (let b = 0; b < 200; b++) g.render(l, r)
    g.setTone!(1)
    const out: number[] = []
    for (let b = 0; b < 200; b++) {
      g.render(l, r)
      out.push(...l)
    }
    expect(worstClick(Float32Array.from(out))).toBeLessThan(8)
  })
})

describe('softClip', () => {
  it('is transparent below −3 dBFS and bounded by 1', () => {
    expect(softClip(0.5)).toBe(0.5)
    expect(softClip(-0.62)).toBe(-0.62)
    // Never above −1 dBFS, so a single sound can't reach the output limiter.
    expect(softClip(10)).toBeLessThanOrEqual(0.891)
    expect(softClip(-10)).toBeGreaterThanOrEqual(-0.891)
    expect(softClip(-10)).toBeGreaterThanOrEqual(-1)
    expect(softClip(0.8)).toBeLessThan(0.8)
  })
})
