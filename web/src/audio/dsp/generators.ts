import { DEFAULT_INTENSITY, MAX_BLOCK, trimAndClip, type Generator } from './block'
import { type SoundId } from '../soundIds'
import { Rng } from './rng'
import { Tone } from './tone'
import { Fire } from './sounds/fire'
import { Airplane, Fan, Steam, Train } from './sounds/machines'
import { Night } from './sounds/night'
import { Balanced, Bright, Dark, Grey } from './sounds/noise'
import { Ocean } from './sounds/ocean'
import { Rain } from './sounds/rain'
import { Stream } from './sounds/stream'
import { Wind } from './sounds/wind'

/**
 * Procedural sound recipes (one module per sound in ./sounds). Each generator
 * writes raw stereo; {@link createGenerator} applies the loudness trim and a
 * soft clip. Recipes are documented in /spec/sounds/README.md.
 */
export type { Generator } from './block'
export { DEFAULT_INTENSITY, softClip } from './block'

export { SOUND_IDS, isSoundId, type SoundId } from '../soundIds'

type Factory = new (sampleRate: number, rng: Rng, intensity: number) => Generator

const FACTORIES: Record<SoundId, Factory> = {
  balanced: Balanced,
  bright: Bright,
  dark: Dark,
  grey: Grey,
  rain: Rain,
  ocean: Ocean,
  stream: Stream,
  wind: Wind,
  night: Night,
  fire: Fire,
  fan: Fan,
  steam: Steam,
  airplane: Airplane,
  train: Train,
}

/** Integrated loudness every sound is normalised to at its default intensity. */
export const TARGET_LUFS = -22

/**
 * Loudness trims (linear gain) so every sound measures {@link TARGET_LUFS} at
 * its default intensity and seed. Re-calibrate with `npm run calibrate` after
 * changing a recipe; the generator tests fail if they drift.
 */
export const TRIMS: Record<SoundId, number> = {
  balanced: 0.3021,
  bright: 0.0962,
  dark: 1.9482,
  grey: 0.2658,
  rain: 0.3784,
  ocean: 3.7952,
  stream: 0.5357,
  wind: 1.6574,
  night: 1.3188,
  fire: 2.432,
  fan: 0.4785,
  steam: 0.635,
  airplane: 1.5448,
  train: 1.6267,
}

export function createGenerator(
  id: SoundId,
  sampleRate: number,
  seed: number,
  intensity = DEFAULT_INTENSITY,
  tone = 0,
  params: Readonly<Record<string, number>> = {},
): Generator {
  const inner = new FACTORIES[id](sampleRate, new Rng(seed), intensity)
  for (const [key, value] of Object.entries(params)) inner.setParam(key, value)
  const trim = TRIMS[id]
  const toneStage = new Tone(sampleRate, tone)
  const render = (left: Float32Array, right: Float32Array) => {
    inner.render(left, right)
    // Tone before the soft clip: boosts are rounded off, never hard-limited.
    toneStage.process(left, right)
    trimAndClip(left, trim)
    trimAndClip(right, trim)
  }
  return {
    setIntensity: (v) => inner.setIntensity(v),
    setParam: (key, v) => inner.setParam(key, v),
    setTone: (v) => toneStage.set(v),
    render(left, right) {
      if (left.length <= MAX_BLOCK) {
        render(left, right)
        return
      }
      // Larger than a render quantum (not seen in current browsers): split it.
      for (let s = 0; s < left.length; s += MAX_BLOCK) {
        const e = Math.min(left.length, s + MAX_BLOCK)
        render(left.subarray(s, e), right.subarray(s, e))
      }
    },
  }
}
