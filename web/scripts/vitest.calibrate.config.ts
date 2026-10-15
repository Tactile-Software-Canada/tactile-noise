import { defineConfig } from 'vitest/config'

// Prints loudness, peak, spectral slope and suggested trims for each sound.
// Usage: npm run calibrate   (or IDS=rain,fire npm run calibrate)
export default defineConfig({ test: { include: ['scripts/calibrate.ts'], testTimeout: 600_000 } })
