import { isSoundId, type SoundId } from './audio/soundIds'
import type { OutputMode } from './audio/engine'
import { clamp } from './audio/levels'
import { SOUNDS } from './sounds'

export interface SoundSettings {
  /** 0–100 */
  intensity: number
  /** −100 (warm/dark) … 100 (bright) */
  tilt: number
}

export interface Favorite {
  id: string
  sound: SoundId
  volume: number
  intensity: number
  tilt: number
}

export type Theme = 'system' | 'dark' | 'light'

export interface Settings {
  sound: SoundId
  /** 0–100 */
  volume: number
  /** Volume used while "With media" is on. */
  mediaVolume: number
  withMedia: boolean
  perSound: Record<SoundId, SoundSettings>
  fadeInSeconds: number
  /** 0 = off */
  timerMinutes: number
  timerFadeSeconds: number
  mono: boolean
  output: OutputMode
  favorites: Favorite[]
  theme: Theme
  /** The "install the app" card was dismissed. */
  installDismissed: boolean
  /** The first-time onboarding experience was completed or dismissed. */
  onboardingDismissed: boolean
}

export const MAX_FAVORITES = 6
export const FADE_IN_OPTIONS = [0, 2, 5, 10]
export const TIMER_PRESETS = [0, 15, 30, 45, 60, 90]
export const TIMER_FADE_OPTIONS = [10, 30, 60, 120, 300]

const KEY = 'ben-gen:settings:v1'

export function defaultSettings(): Settings {
  const perSound = {} as Record<SoundId, SoundSettings>
  for (const s of SOUNDS) perSound[s.id] = { intensity: 50, tilt: 0 }
  return {
    sound: 'balanced',
    volume: 40,
    mediaVolume: 25,
    withMedia: false,
    perSound,
    fadeInSeconds: 2,
    timerMinutes: 0,
    timerFadeSeconds: 60,
    mono: false,
    output: 'media',
    favorites: [],
    theme: 'system',
    installDismissed: false,
    onboardingDismissed: false,
  }
}

/** Accepts anything (old versions, hand-edited storage) and returns valid settings. */
export function sanitize(raw: unknown): Settings {
  const d = defaultSettings()
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Record<string, unknown>
  const num = (v: unknown, lo: number, hi: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), lo, hi) : fallback
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
  const oneOf = <T>(v: unknown, options: T[], fallback: T) =>
    options.includes(v as T) ? (v as T) : fallback

  const perSound = d.perSound
  const rawPer = (r.perSound ?? {}) as Record<string, Partial<SoundSettings> | undefined>
  for (const s of SOUNDS) {
    const p = rawPer[s.id]
    perSound[s.id] = {
      intensity: num(p?.intensity, 0, 100, 50),
      tilt: num(p?.tilt, -100, 100, 0),
    }
  }

  const favorites: Favorite[] = []
  if (Array.isArray(r.favorites)) {
    for (const f of r.favorites.slice(0, MAX_FAVORITES)) {
      if (!f || typeof f !== 'object' || !isSoundId(f.sound)) continue
      favorites.push({
        id: typeof f.id === 'string' ? f.id : newId(),
        sound: f.sound,
        volume: num(f.volume, 0, 100, d.volume),
        intensity: num(f.intensity, 0, 100, 50),
        tilt: num(f.tilt, -100, 100, 0),
      })
    }
  }

  return {
    sound: isSoundId(r.sound) ? r.sound : d.sound,
    volume: num(r.volume, 0, 100, d.volume),
    mediaVolume: num(r.mediaVolume, 0, 100, d.mediaVolume),
    withMedia: bool(r.withMedia, d.withMedia),
    perSound,
    fadeInSeconds: oneOf(r.fadeInSeconds, FADE_IN_OPTIONS, d.fadeInSeconds),
    timerMinutes: num(r.timerMinutes, 0, 24 * 60, d.timerMinutes),
    timerFadeSeconds: oneOf(r.timerFadeSeconds, TIMER_FADE_OPTIONS, d.timerFadeSeconds),
    mono: bool(r.mono, d.mono),
    output: oneOf<OutputMode>(r.output, ['media', 'direct'], d.output),
    favorites,
    theme: oneOf<Theme>(r.theme, ['system', 'dark', 'light'], d.theme),
    installDismissed: bool(r.installDismissed, d.installDismissed),
    onboardingDismissed: bool(r.onboardingDismissed, d.onboardingDismissed),
  }
}

export function loadSettings(): Settings {
  try {
    const json = localStorage.getItem(KEY)
    return sanitize(json ? JSON.parse(json) : null)
  } catch {
    return defaultSettings()
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Storage full or blocked: settings just won't persist this session.
  }
}

export function clearSettings(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing stored, or storage blocked.
  }
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}
