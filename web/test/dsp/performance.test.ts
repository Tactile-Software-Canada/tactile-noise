import { PerformanceObserver } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { SOUND_IDS, createGenerator, type SoundId } from '../../src/audio/dsp/generators'
import { SR } from './analysis'

/**
 * Real-time safety of the DSP (see docs/investigations/2026-10-playback-gaps.md).
 * Garbage collection pauses the audio thread, so rendering must (nearly) never
 * allocate; and rendering must stay far below real time.
 */

const BLOCK = 128

function renderSeconds(id: SoundId, seconds: number, gen = createGenerator(id, SR, 3)) {
  const l = new Float32Array(BLOCK)
  const r = new Float32Array(BLOCK)
  const blocks = Math.round((seconds * SR) / BLOCK)
  for (let b = 0; b < blocks; b++) gen.render(l, r)
  return gen
}

async function gcsDuring(fn: () => void): Promise<number> {
  let count = 0
  const obs = new PerformanceObserver((list) => (count += list.getEntries().length))
  obs.observe({ entryTypes: ['gc'] })
  fn()
  // GC entries are delivered asynchronously.
  await new Promise((resolve) => setTimeout(resolve, 20))
  obs.disconnect()
  return count
}

const PURE_NOISES: SoundId[] = ['balanced', 'bright', 'dark', 'grey'].filter((id) =>
  SOUND_IDS.includes(id as SoundId),
) as SoundId[]

describe.each(SOUND_IDS)('%s', (id) => {
  it('allocates (almost) nothing while rendering', async () => {
    const gen = renderSeconds(id, 5) // let V8 optimise first
    // Best of three, so a one-off collection of the test harness's own garbage
    // can't fail the test; a steady allocation in the DSP still would.
    let gcs = Infinity
    for (let run = 0; run < 3; run++) {
      gcs = Math.min(gcs, await gcsDuring(() => renderSeconds(id, 20, gen)))
    }
    // Before the block-based rewrite this was 30–158 per 20 s.
    expect(gcs).toBeLessThanOrEqual(PURE_NOISES.includes(id) ? 0 : 6)
  })

  it('renders in well under 10% of real time', () => {
    const gen = renderSeconds(id, 2)
    const t0 = performance.now()
    renderSeconds(id, 10, gen)
    const share = (performance.now() - t0) / 10_000
    expect(share).toBeLessThan(0.1)
  })
})
