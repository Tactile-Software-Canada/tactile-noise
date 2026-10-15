/**
 * Lock-screen / notification / headset controls via the Media Session API.
 * Browsers show these only while a real <audio> element is playing (see
 * keepalive.ts); the Media Session API then sets their title and actions.
 */
export interface MediaHandlers {
  play(): void
  pause(): void
  stop(): void
  /** Next/previous sound (shown as skip buttons). */
  next(): void
  previous(): void
}

export function setupMediaSession(handlers: MediaHandlers): void {
  const ms = navigator.mediaSession
  if (!ms) return
  const set = (action: MediaSessionAction, fn: (() => void) | null) => {
    try {
      ms.setActionHandler(action, fn)
    } catch {
      // Action not supported by this browser.
    }
  }
  set('play', handlers.play)
  set('pause', handlers.pause)
  set('stop', handlers.stop)
  set('nexttrack', handlers.next)
  set('previoustrack', handlers.previous)
  // Generated sound has no timeline: no seeking.
  for (const action of ['seekto', 'seekbackward', 'seekforward'] as const) set(action, null)
}

export function updateMediaSession(title: string | null, playing: boolean): void {
  const ms = navigator.mediaSession
  if (!ms) return
  if (title && typeof MediaMetadata !== 'undefined') {
    const icon = (size: number) => ({
      src: new URL(`icons/icon-${size}.png`, document.baseURI).href,
      sizes: `${size}x${size}`,
      type: 'image/png',
    })
    ms.metadata = new MediaMetadata({
      title,
      artist: 'Tactile Noise',
      artwork: [icon(192), icon(512)],
    })
  }
  ms.playbackState = playing ? 'playing' : title ? 'paused' : 'none'
  // Otherwise the notification shows a progress bar for the 10 s keepalive
  // loop. An infinite duration marks it as live, open-ended audio.
  try {
    ms.setPositionState?.({ duration: Infinity, position: 0, playbackRate: 1 })
  } catch {
    try {
      ms.setPositionState?.()
    } catch {
      // Not supported.
    }
  }
}
