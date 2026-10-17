import { expect, type Page } from '@playwright/test'

// Tests find elements by id, data-testid, value or role, and check app or engine
// state, never visible wording, so copy can change without touching the tests.

type Status = 'stopped' | 'starting' | 'playing' | 'stopping'

interface EngineState {
  status: Status
  sound: string | null
  timerEndsAt: number | null
}

/** The audio engine's own state (see AudioEngine.getState). */
export const engineState = (page: Page) =>
  page.evaluate(() => (window as any).benGen.engine.getState() as EngineState)

export const expectStatus = (page: Page, status: Status, timeout?: number) =>
  expect.poll(async () => (await engineState(page)).status, { timeout }).toBe(status)

export const expectPlaying = (page: Page, sound?: string) =>
  expect
    .poll(() => engineState(page), { timeout: 5000 })
    .toMatchObject({ status: 'playing', ...(sound ? { sound } : {}) })

/** Output level (dBFS RMS) measured inside the page's audio graph. */
export const level = (page: Page) =>
  page.evaluate(() => (window as any).benGen.engine.measureDb() as number)

export const soundRadio = (page: Page, id: string) =>
  page.locator(`input[name="sound"][value="${id}"]`)

export const DESKTOP_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

/** The Playback mode radios (Android only). */
export const outputRadio = (page: Page, mode: 'media' | 'direct') =>
  page.locator(`input[name="output"][value="${mode}"]`)

export const volumeSlider = (page: Page) => page.locator('#volume')

/** Marks onboarding as seen before the app loads. */
export const skipOnboarding = (page: Page) =>
  page.addInitScript(() => {
    try {
      const raw = localStorage.getItem('ben-gen:settings:v1')
      const current = raw ? JSON.parse(raw) : {}
      localStorage.setItem(
        'ben-gen:settings:v1',
        JSON.stringify({ ...current, onboardingDismissed: true }),
      )
    } catch {}
  })
