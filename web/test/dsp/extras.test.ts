import { describe, expect, it } from 'vitest'
import { boostGain } from '../../src/audio/dsp/block'
import { Biquad } from '../../src/audio/dsp/filters'
import { createGenerator } from '../../src/audio/dsp/generators'
import { SR, bandCentres, render, thirdOctaveDensityDb } from './analysis'

describe('boostGain', () => {
  it('is silent at 0, unity at the default 0.5 and the maximum at 1', () => {
    expect(boostGain(0, 6)).toBe(0)
    expect(boostGain(0.5, 6)).toBe(1)
    expect(boostGain(1, 6)).toBe(6)
  })

  it('rises steadily and stays in range for junk', () => {
    let last = -1
    for (let v = 0; v <= 1; v += 0.05) {
      const g = boostGain(v, 4)
      expect(g).toBeGreaterThan(last)
      last = g
    }
    expect(boostGain(-3, 4)).toBe(0)
    expect(boostGain(9, 4)).toBe(4)
    expect(Number.isFinite(boostGain(NaN, 4))).toBe(true)
  })
})

describe('Airplane: engine volume', () => {
  const bands = [79, 99, 250, 500, 1000, 2000]
  const density = (engineVolume: number) =>
    thirdOctaveDensityDb(render('airplane', 10, 0.5, 7, { engineVolume }).left, bands)

  it('raises and lowers the engine hum without touching the cabin roar', () => {
    const [off, normal, loud] = [0, 0.5, 1].map(density)
    // The 88 Hz hum (79 and 99 Hz bands) follows the control…
    for (const i of [0, 1]) {
      expect(off![i]).toBeLessThan(normal![i]! - 2)
      expect(loud![i]).toBeGreaterThan(normal![i]! + 6)
    }
    // …while the roar and the vent hiss stay put.
    for (const i of [2, 3, 4, 5]) {
      expect(off![i]).toBeCloseTo(normal![i]!, 0)
      expect(loud![i]).toBeCloseTo(normal![i]!, 0)
    }
  })

  it('moves smoothly (no click when the slider jumps)', () => {
    const gen = createGenerator('airplane', SR, 7, 0.5)
    const l = new Float32Array(128)
    const r = new Float32Array(128)
    for (let b = 0; b < 200; b++) gen.render(l, r)
    gen.setParam('engineVolume', 1)
    let worstStep = 0
    let last = l[127]!
    for (let b = 0; b < 400; b++) {
      gen.render(l, r)
      for (const v of l) {
        worstStep = Math.max(worstStep, Math.abs(v - last))
        last = v
      }
    }
    // The hum is a ~90 Hz tone: adjacent samples can't differ by much, however loud it gets.
    expect(worstStep).toBeLessThan(0.05)
  })
})

describe('Train: bumps', () => {
  /** Energy of the 1.5 kHz+ clicks in 10 ms windows: the bumps stand out of the rumble there. */
  function clickEnvelope(x: Float32Array): Float64Array {
    const y = x.slice()
    new Biquad(SR).highpass(1500).process(y, 0, y.length)
    const win = Math.round(SR * 0.01)
    const out = new Float64Array(Math.floor(y.length / win))
    for (let w = 0; w < out.length; w++) {
      let sum = 0
      for (let i = w * win; i < (w + 1) * win; i++) sum += y[i]! * y[i]!
      out[w] = sum
    }
    return out
  }

  /** Times (s) at which a click starts: the envelope jumps above a share of its peak. */
  function clickTimes(x: Float32Array): number[] {
    const env = clickEnvelope(x)
    const thr = 0.1 * Math.max(...env)
    const times: number[] = []
    for (let w = 1; w < env.length; w++) {
      if (env[w]! > thr && env[w - 1]! <= thr) times.push(w * 0.01)
    }
    return times
  }

  /**
   * Share of clicks that have another a rail-joint period (1 s at intensity 0.5) later,
   * give or take 3%: 1 for a metronome, low for bumps that arrive unevenly.
   */
  function regularity(bumpRandomness: number): number {
    const times = clickTimes(render('train', 60, 0.5, 7, { bumpRandomness, bumpVolume: 1 }).left)
    const repeated = times.filter((t) => times.some((u) => Math.abs(u - t - 1) <= 0.04))
    return repeated.length / times.length
  }

  it('keeps a steady rhythm at 0 and loses it as randomness rises', () => {
    expect(regularity(0)).toBeGreaterThan(0.7)
    expect(regularity(1)).toBeLessThan(0.5)
    expect(regularity(0.5)).toBeLessThan(regularity(0))
  })

  it('sets the bump volume independently of the rumble', () => {
    const level = (bumpVolume: number) => {
      const env = clickEnvelope(render('train', 20, 0.5, 7, { bumpVolume }).left)
      return env.reduce((a, b) => a + b, 0)
    }
    const [off, normal, loud] = [0, 0.5, 1].map(level)
    expect(off!).toBeLessThan(normal!)
    expect(loud!).toBeGreaterThan(normal! * 2)

    const low = (bumpVolume: number) =>
      thirdOctaveDensityDb(render('train', 20, 0.5, 7, { bumpVolume }).left, bandCentres(50, 65))
    // Well below the bumps' own band, the rumble doesn't move.
    low(0).forEach((db, i) => expect(db).toBeCloseTo(low(1)[i]!, 0))
  })

  it('goes silent at 0 without leaking voices', () => {
    const r = render('train', 120, 1, 7, { bumpVolume: 0, bumpRandomness: 1 })
    expect(r.left.every(Number.isFinite)).toBe(true)
    const gen = createGenerator('train', SR, 7, 0.5, 0, { bumpVolume: 0 })
    gen.setParam('bumpVolume', 0.5)
    const l = new Float32Array(128)
    const r2 = new Float32Array(128)
    let clicks = 0
    const hp = new Biquad(SR).highpass(1500)
    for (let b = 0; b < (30 * SR) / 128; b++) {
      gen.render(l, r2)
      hp.process(l, 0, l.length)
      if (l.some((v) => Math.abs(v) > 0.001)) clicks++
    }
    // Bumps come back once the control does.
    expect(clicks).toBeGreaterThan(0)
  })
})

describe('extra controls in general', () => {
  it('ignore ids the sound does not have', () => {
    const a = createGenerator('rain', SR, 7, 0.5, 0, { bumpVolume: 1 })
    const b = createGenerator('rain', SR, 7, 0.5)
    b.setParam('engineVolume', 0)
    const la = new Float32Array(128)
    const lb = new Float32Array(128)
    const r = new Float32Array(128)
    a.render(la, r)
    b.render(lb, r)
    expect(la).toEqual(lb)
  })

  it('apply the values a generator starts with', () => {
    const quiet = render('train', 20, 0.5, 7, { bumpVolume: 0 })
    const normal = render('train', 20, 0.5, 7)
    expect(quiet.left).not.toEqual(normal.left)
  })
})
