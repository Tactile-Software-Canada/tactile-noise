import { expect, test, type Page } from '@playwright/test'

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
  await page.addInitScript(() => {
    try {
      const raw = localStorage.getItem('ben-gen:settings:v1')
      const current = raw ? JSON.parse(raw) : {}
      localStorage.setItem(
        'ben-gen:settings:v1',
        JSON.stringify({ ...current, onboardingDismissed: true }),
      )
    } catch {}
  })
  await page.goto('./')
})

test('plays a real, unmuted media element (>5 s) so browsers show media controls', async ({
  page,
}) => {
  await page.getByRole('radio', { name: /Rain/ }).check()
  await page.getByTestId('play').click()
  await expect
    .poll(() => media(page))
    .toMatchObject({
      paused: false,
      muted: false,
      volume: 1,
      usesStream: false,
      playbackState: 'playing',
      title: 'Rain',
    })
  expect((await media(page)).duration).toBeGreaterThan(5)

  await page.getByRole('button', { name: /Stop/ }).click()
  await expect.poll(() => media(page)).toMatchObject({ paused: true, playbackState: 'paused' })
})

test('stops when the system pauses the media (phone call, another app)', async ({ page }) => {
  await page.getByTestId('play').click()
  await expect(page.getByTestId('status')).toHaveText(/Playing/)
  await page.evaluate(() => (window as any).benGen.engine.mediaElement.pause())
  await expect(page.getByTestId('status')).toHaveText('Stopped')
})

test('"Mix with other audio" plays without the media element', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Playback mode').selectOption('direct')
  await page.keyboard.press('Escape')
  await page.getByTestId('play').click()
  await expect(page.getByTestId('status')).toHaveText(/Playing/)
  expect((await media(page)).paused).toBe(true)
  // Switching back while playing brings the controls back.
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Playback mode').selectOption('media')
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
  await expect(page.getByTestId('status')).toHaveText(/Playing/)
  const latencyMs = await page.evaluate(
    () => (window as any).benGen.engine.getDiagnostics().latencyMs as number,
  )
  expect(latencyMs).toBeGreaterThanOrEqual(150)
  await expect(page.getByRole('switch', { name: /audio buffer/i })).toHaveCount(0)
})
