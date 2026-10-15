import { describe, expect, it } from 'vitest'
import {
  KEEPALIVE_AMPLITUDE,
  KEEPALIVE_SAMPLE_RATE,
  KEEPALIVE_SECONDS,
  keepaliveWav,
} from '../src/audio/keepalive'

describe('keepalive WAV', () => {
  const buf = keepaliveWav()
  const v = new DataView(buf)
  const text = (o: number, n: number) => String.fromCharCode(...new Uint8Array(buf, o, n))
  const samples = new Int16Array(buf.slice(44))

  it('has a valid 16-bit mono PCM header', () => {
    expect(text(0, 4)).toBe('RIFF')
    expect(text(8, 4)).toBe('WAVE')
    expect(v.getUint16(20, true)).toBe(1)
    expect(v.getUint16(22, true)).toBe(1)
    expect(v.getUint32(24, true)).toBe(KEEPALIVE_SAMPLE_RATE)
    expect(v.getUint32(40, true)).toBe(samples.length * 2)
  })

  it('is longer than 5 s, the minimum for media notifications', () => {
    expect(samples.length / KEEPALIVE_SAMPLE_RATE).toBe(KEEPALIVE_SECONDS)
    expect(KEEPALIVE_SECONDS).toBeGreaterThan(5)
  })

  it('is not digitally silent, but stays at about −54 dBFS', () => {
    const peak = Math.max(...samples.map(Math.abs)) / 32767
    expect(peak).toBeGreaterThan(KEEPALIVE_AMPLITUDE * 0.95)
    expect(peak).toBeLessThanOrEqual(KEEPALIVE_AMPLITUDE * 1.05)
  })

  it('loops seamlessly (starts and ends on the same phase)', () => {
    expect(samples[0]).toBe(0)
    expect(Math.abs(samples[samples.length - 1]! - samples[0]!)).toBeLessThanOrEqual(2)
  })
})
