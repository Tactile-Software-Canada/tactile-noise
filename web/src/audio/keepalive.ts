/**
 * A short WAV file played on loop by an <audio> element alongside the Web Audio
 * output. Browsers only show media controls (notification, lock screen,
 * headset buttons) for a real media element playing media longer than five
 * seconds; Web Audio and MediaStream playback get none.
 *
 * It must not be digitally silent: Firefox skips media controls for inaudible
 * media. So it carries an 8 Hz sine at −54 dBFS: far below the range of
 * hearing and of phone speakers, but plainly non-silent to the browser.
 */

export const KEEPALIVE_SECONDS = 10
export const KEEPALIVE_SAMPLE_RATE = 8000
export const KEEPALIVE_HZ = 8
export const KEEPALIVE_AMPLITUDE = 0.002 // −54 dBFS

/** 16-bit mono PCM WAV. A whole number of cycles, so the loop is seamless. */
export function keepaliveWav(): ArrayBuffer {
  const n = KEEPALIVE_SECONDS * KEEPALIVE_SAMPLE_RATE
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  v.setUint32(4, 36 + n * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  v.setUint32(16, 16, true) // fmt chunk size
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, KEEPALIVE_SAMPLE_RATE, true)
  v.setUint32(28, KEEPALIVE_SAMPLE_RATE * 2, true) // byte rate
  v.setUint16(32, 2, true) // block align
  v.setUint16(34, 16, true) // bits per sample
  ascii(36, 'data')
  v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    const x =
      KEEPALIVE_AMPLITUDE * Math.sin((2 * Math.PI * KEEPALIVE_HZ * i) / KEEPALIVE_SAMPLE_RATE)
    v.setInt16(44 + i * 2, Math.round(x * 32767), true)
  }
  return buf
}

export function createKeepaliveElement(): HTMLAudioElement {
  const el = document.createElement('audio')
  el.src = URL.createObjectURL(new Blob([keepaliveWav()], { type: 'audio/wav' }))
  el.loop = true
  el.preload = 'auto'
  el.setAttribute('aria-hidden', 'true')
  return el
}
