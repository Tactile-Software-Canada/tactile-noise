import { createGenerator, type SoundId } from '../../src/audio/dsp/generators'

export const SR = 48000
export const SEED = 12345

export interface Render {
  left: Float32Array
  right: Float32Array
}

/** Renders `seconds` of a sound in 128-frame blocks, like the AudioWorklet does. */
export function render(id: SoundId, seconds: number, intensity?: number, seed = SEED): Render {
  const gen = createGenerator(id, SR, seed, intensity)
  const total = Math.round(seconds * SR)
  const left = new Float32Array(total)
  const right = new Float32Array(total)
  const bl = new Float32Array(128)
  const br = new Float32Array(128)
  for (let pos = 0; pos < total; pos += 128) {
    gen.render(bl, br)
    const n = Math.min(128, total - pos)
    left.set(bl.subarray(0, n), pos)
    right.set(br.subarray(0, n), pos)
  }
  return { left, right }
}

/** Integrated loudness (ITU-R BS.1770 K-weighting at 48 kHz, ungated). */
export function lufs({ left, right }: Render): number {
  const ms = (x: Float32Array) => {
    const s1 = biquad(
      [1.53512485958697, -2.69169618940638, 1.19839281085285],
      [-1.69065929318241, 0.73248077421585],
    )
    const s2 = biquad([1, -2, 1], [-1.99004745483398, 0.99007225036621])
    let sum = 0
    for (let i = 0; i < x.length; i++) {
      const y = s2(s1(x[i]!))
      sum += y * y
    }
    return sum / x.length
  }
  return -0.691 + 10 * Math.log10(ms(left) + ms(right))
}

function biquad([b0, b1, b2]: number[], [a1, a2]: number[]) {
  let z1 = 0
  let z2 = 0
  return (x: number) => {
    const y = b0! * x + z1
    z1 = b1! * x - a1! * y + z2
    z2 = b2! * x - a2! * y
    return y
  }
}

export function peakDb({ left, right }: Render): number {
  let peak = 0
  for (const ch of [left, right]) for (const v of ch) peak = Math.max(peak, Math.abs(v))
  return 20 * Math.log10(peak)
}

export function correlation(a: Float32Array, b: Float32Array): number {
  let ab = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < a.length; i++) {
    ab += a[i]! * b[i]!
    aa += a[i]! * a[i]!
    bb += b[i]! * b[i]!
  }
  return ab / Math.sqrt(aa * bb)
}

/** Welch power spectral density (Hann window, 50% overlap). Returns power per FFT bin. */
export function psd(x: Float32Array, n = 8192): Float64Array {
  const out = new Float64Array(n / 2)
  const win = new Float64Array(n)
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  let frames = 0
  for (let start = 0; start + n <= x.length; start += n / 2) {
    for (let i = 0; i < n; i++) {
      re[i] = x[start + i]! * win[i]!
      im[i] = 0
    }
    fft(re, im)
    for (let k = 0; k < n / 2; k++) out[k] = out[k]! + re[k]! * re[k]! + im[k]! * im[k]!
    frames++
  }
  for (let k = 0; k < n / 2; k++) out[k] = out[k]! / frames
  return out
}

/** Average spectral density (dB) in 1/3-octave bands centred on `centres`. */
export function thirdOctaveDensityDb(x: Float32Array, centres: number[], n = 8192): number[] {
  const p = psd(x, n)
  const binHz = SR / n
  return centres.map((fc) => {
    const lo = Math.max(1, Math.floor((fc * 2 ** (-1 / 6)) / binHz))
    const hi = Math.ceil((fc * 2 ** (1 / 6)) / binHz)
    let sum = 0
    for (let k = lo; k <= hi; k++) sum += p[k]!
    return 10 * Math.log10(sum / (hi - lo + 1))
  })
}

/** ISO third-octave centres from `from` to `to`. */
export function bandCentres(from = 50, to = 16000): number[] {
  const out: number[] = []
  for (let i = -20; i <= 13; i++) {
    const f = 1000 * 2 ** (i / 3)
    if (f >= from * 0.99 && f <= to * 1.01) out.push(Math.round(f))
  }
  return out
}

/** Least-squares slope of density vs. octave, in dB/oct. */
export function slopeDbPerOct(centres: number[], db: number[]): number {
  const xs = centres.map((f) => Math.log2(f))
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = db.reduce((a, b) => a + b, 0) / db.length
  let num = 0
  let den = 0
  xs.forEach((x, i) => {
    num += (x - mx) * (db[i]! - my)
    den += (x - mx) ** 2
  })
  return num / den
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j]!, re[i]!]
      ;[im[i], im[j]] = [im[j]!, im[i]!]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = a + len / 2
        const tr = re[b]! * cr - im[b]! * ci
        const ti = re[b]! * ci + im[b]! * cr
        re[b] = re[a]! - tr
        im[b] = im[a]! - ti
        re[a] = re[a]! + tr
        im[a] = im[a]! + ti
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
}
