import type { SoundId } from './soundIds'

export const PROCESSOR_NAME = 'ben-gen-generator'

export interface ProcessorOptions {
  sound: SoundId
  seed: number
  intensity: number
  /** −1 (warmer) … 1 (brighter). */
  tone: number
  /** Extra controls (0–1) by id, for the sounds that have them. */
  params: Record<string, number>
  /** Report render load once a second (Settings → Diagnostics). */
  stats: boolean
}

/** Main thread → worklet. */
export type ProcessorMessage =
  | { type: 'intensity'; value: number }
  | { type: 'tone'; value: number }
  | { type: 'param'; id: string; value: number }
  | { type: 'stats'; enabled: boolean }
  | { type: 'dispose' }

/** Worklet → main thread. */
export interface StatsMessage {
  type: 'stats'
  /** Share of real time spent rendering over the last second (0–1). */
  load: number
  /** Longest single render call in that second, in ms (1 ms resolution). */
  maxBlockMs: number
}
