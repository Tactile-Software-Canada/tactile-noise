import { describe, expect, it } from 'vitest'
import { SOUND_IDS } from '../src/audio/soundIds'
import { CATEGORIES, SOUNDS, adjacentSound } from '../src/sounds'

describe('sound catalog', () => {
  it('describes every generated sound exactly once', () => {
    expect(SOUNDS.map((s) => s.id).sort()).toEqual([...SOUND_IDS].sort())
  })

  it('puts every sound in a known category, and every category has sounds', () => {
    const ids = CATEGORIES.map((c) => c.id)
    for (const s of SOUNDS) expect(ids).toContain(s.category)
    for (const c of ids) expect(SOUNDS.some((s) => s.category === c)).toBe(true)
  })

  it('gives every extra control a unique id and a default in range', () => {
    for (const s of SOUNDS) {
      const ids = (s.extras ?? []).map((e) => e.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const e of s.extras ?? []) {
        expect(e.default).toBeGreaterThanOrEqual(0)
        expect(e.default).toBeLessThanOrEqual(100)
      }
    }
  })

  it('cycles through sounds in both directions', () => {
    const first = SOUNDS[0]!.id
    const last = SOUNDS[SOUNDS.length - 1]!.id
    expect(adjacentSound(last, 1)).toBe(first)
    expect(adjacentSound(first, -1)).toBe(last)
  })
})
