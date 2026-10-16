import { expect, test, type Page } from '@playwright/test'
import { expectPlaying, expectStatus, skipOnboarding, soundRadio } from './helpers'

/** State of the <audio> element behind the media controls, and of the Media Session. */
const media = (page: Page) =>
  page.evaluate(() => {
    const el = (window as any).benGen.engine.mediaElement as HTMLAudioElement
    return {
      paused: el.paused,
      muted: el.muted,
      volume: el.volume,
      duration: el.duration,
      usesStream: el.srcObject !== null,
      playbackState: navigator.mediaSession.playbackState,
      title: navigator.mediaSession.metadata?.title ?? null,
    }
  })

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('./')
})

test('plays a real, unmuted media element (>5 s) so browsers show media controls', async ({
  page,
}) => {
  await soundRadio(page, 'rain').check()
  await page.getByTestId('play').click()
  await expect
    .poll(() => media(page))
    .toMatchObject({
      paused: false,
      muted: false,
      volume: 1,
      usesStream: false,
      playbackState: 'playing',
      title: expect.any(String),
    })
  expect((await media(page)).duration).toBeGreaterThan(5)

  await page.getByTestId('play').click()
  await expect.poll(() => media(page)).toMatchObject({ paused: true, playbackState: 'paused' })
})

test('stops when the system pauses the media (phone call, another app)', async ({ page }) => {
  await page.getByTestId('play').click()
  await expectPlaying(page)
  await page.evaluate(() => (window as any).benGen.engine.mediaElement.pause())
  await expectStatus(page, 'stopped')
})

test('"Mix with other audio" plays without the media element', async ({ page }) => {
  await page.getByTestId('open-settings').click()
  await page.locator('#output').selectOption('direct')
  await page.keyboard.press('Escape')
  await page.getByTestId('play').click()
  await expectPlaying(page)
  expect((await media(page)).paused).toBe(true)
  // Switching back while playing brings the controls back.
  await page.getByTestId('open-settings').click()
  await page.locator('#output').selectOption('media')
  await expect.poll(async () => (await media(page)).paused).toBe(false)
})

test('iOS/WebKit-only quirk: requests a "playback" audio session when the API exists', async ({
  page,
}) => {
  // Chromium has no navigator.audioSession, so stub it before the app loads.
  await page.addInitScript(() => {
    ;(navigator as any).audioSession = { type: 'auto' }
  })
  await page.goto('./')
  expect(await page.evaluate(() => (navigator as any).audioSession.type)).toBe('playback')
})

test('uses a large output buffer (fewer dropouts on slow phones)', async ({ page }) => {
  // Decision 2026-10-13 (docs/PLAN.md §4.3): always ask for ~0.3 s of buffering.
  await page.getByTestId('play').click()
  await expectPlaying(page)
  const latencyMs = await page.evaluate(
    () => (window as any).benGen.engine.getDiagnostics().latencyMs as number,
  )
  expect(latencyMs).toBeGreaterThanOrEqual(150)
})
