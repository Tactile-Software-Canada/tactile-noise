import { describe, expect, it } from 'vitest'
import { formatRemaining, tiltToShelves, volumeToGain } from '../src/audio/levels'
import { MAX_FAVORITES, defaultSettings, sanitize } from '../src/settings'

describe('sanitize', () => {
  it('returns defaults for junk', () => {
    expect(sanitize(null)).toEqual(defaultSettings())
    expect(sanitize('nope')).toEqual(defaultSettings())
  })

  it('keeps valid values and clamps or replaces invalid ones', () => {
    const s = sanitize({
      sound: 'rain',
      volume: 250,
      mediaVolume: -5,
      withMedia: true,
      perSound: { rain: { intensity: 80, tilt: -500 }, fire: 'x' },
      fadeInSeconds: 7,
      timerMinutes: 30,
      output: 'direct',
    })
    expect(s.sound).toBe('rain')
    expect(s.volume).toBe(100)
    expect(s.mediaVolume).toBe(0)
    expect(s.withMedia).toBe(true)
    expect(s.perSound.rain).toEqual({ intensity: 80, tilt: -100 })
    expect(s.perSound.fire).toEqual({ intensity: 50, tilt: 0 })
    expect(s.fadeInSeconds).toBe(defaultSettings().fadeInSeconds)
    expect(s.timerMinutes).toBe(30)
    expect(s.output).toBe('direct')
  })

  it('drops invalid favorites and caps the list', () => {
    const fav = { id: 'a', sound: 'ocean', volume: 20, intensity: 40, tilt: 10 }
    const s = sanitize({ favorites: [{ sound: 'thunder' }, ...Array(10).fill(fav)] })
    expect(s.favorites.length).toBeLessThanOrEqual(MAX_FAVORITES)
    expect(s.favorites.every((f) => f.sound === 'ocean')).toBe(true)
  })

  it('validates theme, install-card, and onboarding settings', () => {
    expect(
      sanitize({ theme: 'light', installDismissed: true, onboardingDismissed: true }),
    ).toMatchObject({
      theme: 'light',
      installDismissed: true,
      onboardingDismissed: true,
    })
    expect(
      sanitize({ theme: 'purple', installDismissed: 'yes', onboardingDismissed: 'maybe' }),
    ).toMatchObject({
      theme: 'system',
      installDismissed: false,
      onboardingDismissed: false,
    })
  })

  it('gives every sound, including new ones, default per-sound settings', () => {
    const s = sanitize({ perSound: { rain: { intensity: 70, tilt: 0 } } })
    expect(s.perSound.fan).toEqual({ intensity: 50, tilt: 0 })
    expect(s.perSound.rain.intensity).toBe(70)
  })

  it('gives sounds with extra controls their defaults, and keeps valid saved values', () => {
    const d = defaultSettings()
    expect(d.perSound.train.extras).toEqual({ bumpRandomness: 0, bumpVolume: 50 })
    expect(d.perSound.airplane.extras).toEqual({ engineVolume: 50 })
    const s = sanitize({
      perSound: {
        // Settings saved before the extras existed.
        airplane: { intensity: 60, tilt: 0 },
        train: {
          intensity: 50,
          tilt: 0,
          extras: { bumpRandomness: 250, bumpVolume: 'loud', other: 5 },
        },
      },
    })
    expect(s.perSound.airplane).toEqual({ intensity: 60, tilt: 0, extras: { engineVolume: 50 } })
    expect(s.perSound.train.extras).toEqual({ bumpRandomness: 100, bumpVolume: 50 })
  })

  it('keeps the extras of a favorite', () => {
    const fav = {
      id: 'a',
      sound: 'train',
      volume: 20,
      intensity: 40,
      tilt: 10,
      extras: { bumpVolume: 80 },
    }
    const old = { id: 'b', sound: 'train', volume: 20, intensity: 40, tilt: 10 }
    const s = sanitize({ favorites: [fav, old, { ...fav, id: 'c', sound: 'rain' }] })
    expect(s.favorites[0]!.extras).toEqual({ bumpRandomness: 0, bumpVolume: 80 })
    expect(s.favorites[1]!.extras).toEqual({ bumpRandomness: 0, bumpVolume: 50 })
    expect(s.favorites[2]!.extras).toBeUndefined()
  })

  it('drops the removed audio-buffer setting from old saved settings', () => {
    expect('buffer' in sanitize({ buffer: 'normal' })).toBe(false)
  })

  it('ignores unknown sounds', () => {
    expect(sanitize({ sound: 'thunder' }).sound).toBe(defaultSettings().sound)
  })
})

describe('levels', () => {
  it('uses a squared volume taper', () => {
    expect(volumeToGain(0)).toBe(0)
    expect(volumeToGain(100)).toBe(1)
    expect(20 * Math.log10(volumeToGain(30))).toBeCloseTo(-20.92, 1)
    expect(volumeToGain(500)).toBe(1)
  })

  it('maps warmth to opposite shelves', () => {
    expect(tiltToShelves(0)).toEqual({ lowDb: -0, highDb: 0 })
    expect(tiltToShelves(-100)).toEqual({ lowDb: 6, highDb: -6 })
  })

  it('formats the timer countdown', () => {
    expect(formatRemaining(45_000)).toBe('45 s')
    expect(formatRemaining(12 * 60_000)).toBe('12 min')
    expect(formatRemaining(65 * 60_000)).toBe('1 h 05 min')
  })
})
