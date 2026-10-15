import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TRIMS, type SoundId } from '../../src/audio/dsp/generators'
import { SEED, SR, bandCentres, lufs, render, thirdOctaveDensityDb } from './analysis'

/**
 * Golden spectra: language-neutral reference data in /spec/sounds/golden.
 * The Android port renders the same seed and checks against the same files.
 * Regenerate after an intentional change: npm run test:golden:update
 */
const GOLDEN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../spec/sounds/golden')
const UPDATE = process.env.UPDATE_GOLDEN === '1'
const TOLERANCE_DB = 1.5

interface Golden {
  sound: SoundId
  seed: number
  sampleRate: number
  seconds: number
  intensity: number
  lufs: number
  bandsHz: number[]
  densityDb: number[]
}

describe.each(Object.keys(TRIMS) as SoundId[])('golden spectrum: %s', (id) => {
  it('matches the stored reference', () => {
    const seconds = 10
    const r = render(id, seconds)
    const bandsHz = bandCentres(50, 16000)
    const current: Golden = {
      sound: id,
      seed: SEED,
      sampleRate: SR,
      seconds,
      intensity: 0.5,
      lufs: round(lufs(r)),
      bandsHz,
      densityDb: thirdOctaveDensityDb(r.left, bandsHz).map(round),
    }
    const file = resolve(GOLDEN_DIR, `${id}.json`)
    if (UPDATE || !existsSync(file)) {
      if (!UPDATE) throw new Error(`Missing ${file}; run npm run test:golden:update`)
      mkdirSync(GOLDEN_DIR, { recursive: true })
      writeFileSync(file, JSON.stringify(current, null, 2) + '\n')
      return
    }
    const golden = JSON.parse(readFileSync(file, 'utf8')) as Golden
    expect(current.bandsHz).toEqual(golden.bandsHz)
    expect(Math.abs(current.lufs - golden.lufs)).toBeLessThan(0.5)
    current.densityDb.forEach((db, i) => {
      expect(Math.abs(db - golden.densityDb[i]!), `${golden.bandsHz[i]} Hz`).toBeLessThan(
        TOLERANCE_DB,
      )
    })
  })
})

function round(x: number): number {
  return Math.round(x * 100) / 100
}
