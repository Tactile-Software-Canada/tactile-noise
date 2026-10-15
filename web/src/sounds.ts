import type { SoundId } from './audio/soundIds'

export type Category = 'noise' | 'nature' | 'machines'

export const CATEGORIES: { id: Category; name: string }[] = [
  { id: 'noise', name: 'Noise' },
  { id: 'nature', name: 'Nature' },
  { id: 'machines', name: 'Machines & travel' },
]

export interface SoundInfo {
  id: SoundId
  name: string
  description: string
  category: Category
  /** Label for the intensity slider, or null if the sound has no intensity. */
  intensityLabel: string | null
  /** SVG path data for a 24×24 stroked icon. */
  icon: string
  /** Decorative hue (0–360) for the now-playing glow. Never carries meaning. */
  hue: number
}

/** Display order is also the keyboard shortcut order (1–9). */
export const SOUNDS: SoundInfo[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Pink noise: even and natural',
    category: 'noise',
    intensityLabel: null,
    icon: 'M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0 2 3 2 3',
    hue: 210,
  },
  {
    id: 'bright',
    name: 'Bright',
    description: 'White noise: crisp and airy',
    category: 'noise',
    intensityLabel: null,
    icon: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    hue: 45,
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Brown noise: deep and soft',
    category: 'noise',
    intensityLabel: null,
    icon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
    hue: 255,
  },
  {
    id: 'grey',
    name: 'Grey',
    description: 'Grey noise: even to the ear',
    category: 'noise',
    intensityLabel: null,
    icon: 'M4 9v6M8 7v10M12 10v4M16 7v10M20 9v6',
    hue: 220,
  },
  {
    id: 'rain',
    name: 'Rain',
    description: 'Steady rainfall',
    category: 'nature',
    intensityLabel: 'Rainfall',
    icon: 'M7 14a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 6.5 3.75 3.75 0 0 1 17.5 14H7zM8 17l-1 3M12 17l-1 3M16 17l-1 3',
    hue: 205,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Waves rolling onto a beach',
    category: 'nature',
    intensityLabel: 'Wave size',
    icon: 'M2 9c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 14c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2',
    hue: 195,
  },
  {
    id: 'stream',
    name: 'Stream',
    description: 'A babbling brook',
    category: 'nature',
    intensityLabel: 'Flow',
    icon: 'M4 4c4 2 0 6 4 8s0 6 4 8M10 4c4 2 0 6 4 8s0 6 4 8M16 4c2 1 2 2 1.5 3.5',
    hue: 175,
  },
  {
    id: 'wind',
    name: 'Wind',
    description: 'Gusts across open country',
    category: 'nature',
    intensityLabel: 'Gusts',
    icon: 'M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7',
    hue: 190,
  },
  {
    id: 'night',
    name: 'Night',
    description: 'Crickets on a still night',
    category: 'nature',
    intensityLabel: 'Crickets',
    icon: 'M15 4a7.5 7.5 0 1 0 5 12.5A6 6 0 0 1 15 4zM5.5 4v3M4 5.5h3M7.5 10v2M6.5 11h2',
    hue: 240,
  },
  {
    id: 'fire',
    name: 'Fire',
    description: 'A crackling fireplace',
    category: 'nature',
    intensityLabel: 'Crackle',
    icon: 'M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-1.5-2-1.5-3C7 10 6 12.5 6 15a6 6 0 0 0 6 6zM12 21a2.5 2.5 0 0 1-2.5-2.5c0-1.5 1-2.5 2.5-4 1.5 1.5 2.5 2.5 2.5 4A2.5 2.5 0 0 1 12 21z',
    hue: 25,
  },
  {
    id: 'fan',
    name: 'Fan',
    description: 'A steady electric fan',
    category: 'machines',
    intensityLabel: 'Speed',
    icon: 'M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12 10.5C10 7 11 3 13.5 3.5s1.5 5.5-.5 7M13.3 12.8c4 .2 6.7 3 5.4 5.2s-5.6-.3-6.2-2.6M10.7 12.7c-2 3.4-6 4.6-7 2.2s3.8-4.3 6.1-3.5M12 14v7M9 21h6',
    hue: 200,
  },
  {
    id: 'steam',
    name: 'Steam',
    description: 'A soft, steady hiss',
    category: 'machines',
    intensityLabel: 'Surge',
    icon: 'M8 3c-1 1.5 1 2.5 0 4.5M12 3c-1 1.5 1 2.5 0 4.5M16 3c-1 1.5 1 2.5 0 4.5M4 11h16v1a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7z',
    hue: 30,
  },
  {
    id: 'airplane',
    name: 'Airplane',
    description: 'Cruising in the cabin',
    category: 'machines',
    intensityLabel: 'Engine roar',
    icon: 'M12 2.5c1 0 1.5 1 1.5 2.5v4.5l8 4.5v2l-8-2.5v4.5l2.5 2v1.5L12 20l-4 1v-1.5l2.5-2V13l-8 2.5v-2l8-4.5V5c0-1.5.5-2.5 1.5-2.5z',
    hue: 215,
  },
  {
    id: 'train',
    name: 'Train',
    description: 'Riding the rails',
    category: 'machines',
    intensityLabel: 'Speed',
    icon: 'M8 3h8a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM5 11h14M9 14.5h.01M15 14.5h.01M9 18l-2 3M15 18l2 3',
    hue: 265,
  },
]

export function soundInfo(id: SoundId): SoundInfo {
  return SOUNDS.find((s) => s.id === id) ?? SOUNDS[0]!
}

/** The sound before/after `id` in display order, wrapping around. */
export function adjacentSound(id: SoundId, step: 1 | -1): SoundId {
  const i = SOUNDS.findIndex((s) => s.id === id)
  return SOUNDS[(i + step + SOUNDS.length) % SOUNDS.length]!.id
}
