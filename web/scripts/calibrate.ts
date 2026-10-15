import { test } from 'vitest'
import {
  render,
  lufs,
  peakDb,
  correlation,
  thirdOctaveDensityDb,
  bandCentres,
  slopeDbPerOct,
} from '../test/dsp/analysis'
import { TRIMS, type SoundId } from '../src/audio/dsp/generators'
const ids: SoundId[] = (process.env.IDS ?? Object.keys(TRIMS).join(',')).split(',') as SoundId[]
test('calibrate', () => {
  for (const id of ids) {
    const t0 = performance.now()
    const r = render(id, 30)
    const ms = performance.now() - t0
    const c = bandCentres(100, 8000)
    const s = slopeDbPerOct(c, thirdOctaveDensityDb(r.left, c))
    const L = lufs(r)
    process.stdout.write(
      '\n' +
        [
          id,
          'lufs',
          L.toFixed(2),
          'peak',
          peakDb(r).toFixed(2),
          'PLR',
          (peakDb(r) - L).toFixed(1),
          'slope',
          s.toFixed(2),
          'corr',
          correlation(r.left, r.right).toFixed(3),
          'rtf',
          (ms / 30000).toFixed(4),
          'trim',
          (TRIMS[id] * Math.pow(10, (-22 - L) / 20)).toFixed(4),
          'lo/hi',
          [0, 1].map((x) => lufs(render(id, 20, x)).toFixed(1)).join('/'),
        ].join(' '),
    )
  }
}, 600000)
