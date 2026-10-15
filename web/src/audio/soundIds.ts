/**
 * Sound identifiers, kept apart from the DSP so the UI bundle doesn't pull in
 * the generators (they only run inside the AudioWorklet).
 */
export const SOUND_IDS = [
  'balanced',
  'bright',
  'dark',
  'grey',
  'rain',
  'ocean',
  'stream',
  'wind',
  'night',
  'fire',
  'fan',
  'steam',
  'airplane',
  'train',
] as const

export type SoundId = (typeof SOUND_IDS)[number]

export function isSoundId(value: unknown): value is SoundId {
  return typeof value === 'string' && (SOUND_IDS as readonly string[]).includes(value)
}
