import { registerSW } from 'virtual:pwa-register'

/**
 * Installation and updates.
 *
 * Updates use "prompt" mode: a new version downloads in the background and
 * waits. The app offers to restart into it, but never while sound is playing,
 * so an update can't cut off a sleep session.
 */

export interface PwaState {
  /** A new version is downloaded and waiting. */
  updateReady: boolean
  /** Everything is cached; the app works offline from now on. */
  offlineReady: boolean
  /** The browser offered an install prompt we can show (Chrome, Edge, Samsung). */
  canInstall: boolean
  /** Running as an installed app. */
  installed: boolean
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let state: PwaState = {
  updateReady: false,
  offlineReady: false,
  canInstall: false,
  installed: false,
}
const listeners = new Set<(s: PwaState) => void>()
let installPrompt: BeforeInstallPromptEvent | null = null
let updateServiceWorker: ((reload?: boolean) => Promise<void>) | null = null
let registration: ServiceWorkerRegistration | undefined

function set(patch: Partial<PwaState>): void {
  state = { ...state, ...patch }
  for (const fn of listeners) fn(state)
}

export function getPwaState(): PwaState {
  return state
}

export function subscribePwa(fn: (s: PwaState) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function isStandalone(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Call once at startup, before rendering (the install event can fire early). */
export function initPwa(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPrompt = event as BeforeInstallPromptEvent
    set({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = null
    set({ canInstall: false, installed: true })
  })
  set({ installed: isStandalone() })
  if (!('serviceWorker' in navigator)) return
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh: () => set({ updateReady: true }),
    onOfflineReady: () => set({ offlineReady: true }),
    onRegisteredSW: (_url, r) => {
      registration = r
    },
  })
}

/** Shows the browser's install dialog. Resolves true if the user installed. */
export async function promptInstall(): Promise<boolean> {
  const prompt = installPrompt
  if (!prompt) return false
  await prompt.prompt()
  const { outcome } = await prompt.userChoice
  installPrompt = null
  set({ canInstall: false })
  return outcome === 'accepted'
}

/** Activates the waiting version and reloads into it. */
export function applyUpdate(): void {
  void updateServiceWorker?.(true)
}

/** Asks the server for a newer version now (otherwise checked on each launch). */
export async function checkForUpdates(): Promise<void> {
  await registration?.update()
}
