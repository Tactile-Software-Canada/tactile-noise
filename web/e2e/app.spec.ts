import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import {
  DESKTOP_UA,
  IPHONE_UA,
  engineState,
  expectPlaying,
  expectStatus,
  level,
  outputRadio,
  skipOnboarding,
  soundRadio,
  volumeSlider,
} from './helpers'

test.beforeEach(async ({ page }, testInfo) => {
  if (!testInfo.title.includes('first-time onboarding')) await skipOnboarding(page)
  await page.goto('./')
})

/** Minutes left on the running sleep timer, or null. */
const timerMinutesLeft = async (page: Page) => {
  const { timerEndsAt } = await engineState(page)
  return timerEndsAt === null ? null : (timerEndsAt - Date.now()) / 60_000
}

test('plays, switches sound, and stops', async ({ page }) => {
  await expectStatus(page, 'stopped')
  await page.getByTestId('play').click()
  await expectPlaying(page, 'balanced')
  // Audio actually flows through the worklet and graph.
  await expect.poll(() => level(page), { timeout: 5000 }).toBeGreaterThan(-60)

  await soundRadio(page, 'rain').check()
  await expectPlaying(page, 'rain')
  await expect.poll(() => level(page)).toBeGreaterThan(-60)

  await page.getByTestId('play').click()
  await expectStatus(page, 'stopped')
})

test('every sound plays', async ({ page }) => {
  await page.getByTestId('play').click()
  const radios = page.locator('input[name="sound"]')
  const count = await radios.count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    const radio = radios.nth(i)
    await radio.check()
    await expectPlaying(page, (await radio.getAttribute('value'))!)
    await expect.poll(() => level(page), { timeout: 5000 }).toBeGreaterThan(-60)
  }
})

test('switching playback mode mid-playback keeps playing', async ({ page }) => {
  await page.getByTestId('open-settings').click()
  await outputRadio(page, 'direct').check()
  await page.keyboard.press('Escape')
  await page.getByTestId('play').click()
  await expect.poll(() => level(page), { timeout: 5000 }).toBeGreaterThan(-60)
  await page.getByTestId('open-settings').click()
  await outputRadio(page, 'media').check()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1500)
  await expectPlaying(page, 'balanced')
  await expect.poll(() => level(page)).toBeGreaterThan(-60)
})

// The default test device is a Pixel 7, so these run on Android.
test.describe('playback mode on Android', () => {
  test('"make quieter" is only offered when mixing with other audio', async ({ page }) => {
    await page.getByTestId('open-settings').click()
    const withMedia = page.locator('#with-media')
    await expect(withMedia).toHaveCount(0)
    await outputRadio(page, 'direct').check()
    await withMedia.check()
    await page.locator('#media-volume').selectOption('10')
    await page.keyboard.press('Escape')
    await expect(volumeSlider(page)).toHaveValue('10')

    // Back to media controls: the option goes away and the normal volume returns.
    await page.getByTestId('open-settings').click()
    await outputRadio(page, 'media').check()
    await expect(withMedia).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(volumeSlider(page)).toHaveValue('40')
  })

  test('playback mode is the first thing in settings', async ({ page }) => {
    await page.getByTestId('open-settings').click()
    const first = page.locator('#settings-sheet .settings-section').first()
    await expect(first.locator('input[name="output"]')).toHaveCount(2)
    await expect(outputRadio(page, 'media')).toBeChecked()
  })
})

test.describe('playback mode off Android', () => {
  test('desktop has no playback mode setting', async ({ browser }) => {
    const context = await browser.newContext({ userAgent: DESKTOP_UA })
    const page = await context.newPage()
    await skipOnboarding(page)
    await page.goto('./')
    await page.getByTestId('open-settings').click()
    await expect(page.locator('#settings-sheet')).toBeVisible()
    await expect(page.locator('input[name="output"]')).toHaveCount(0)
    await context.close()
  })

  test('iOS has no playback mode, and a saved "mix" setting is ignored', async ({ browser }) => {
    const context = await browser.newContext({ userAgent: IPHONE_UA })
    const page = await context.newPage()
    await skipOnboarding(page)
    await page.addInitScript(() => {
      const raw = localStorage.getItem('ben-gen:settings:v1')
      const current = raw ? JSON.parse(raw) : {}
      localStorage.setItem(
        'ben-gen:settings:v1',
        JSON.stringify({ ...current, output: 'direct', withMedia: true }),
      )
    })
    await page.goto('./')
    await page.getByTestId('open-settings').click()
    await expect(page.locator('input[name="output"]')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.getByTestId('play').click()
    await expectPlaying(page)
    expect(
      await page.evaluate(() => (window as any).benGen.engine.mediaElement.paused as boolean),
    ).toBe(false)
    await context.close()
  })
})

test('remembers settings across reloads', async ({ page }) => {
  await soundRadio(page, 'ocean').check()
  await volumeSlider(page).fill('63')
  await page.getByTestId('open-timer').click()
  const timer = page.locator('#timer-sheet')
  await timer.locator('input[name="timer"][value="30"]').check()
  await timer.getByTestId('sheet-close').click()
  await page.reload()
  await expect(soundRadio(page, 'ocean')).toBeChecked()
  await expect(volumeSlider(page)).toHaveValue('63')
  await page.getByTestId('open-timer').click()
  await expect(timer.locator('input[name="timer"][value="30"]')).toBeChecked()
})

test('volume step buttons move by 1%', async ({ page }) => {
  await page.getByTestId('volume-up').click()
  await expect(volumeSlider(page)).toHaveValue('41')
  await page.getByTestId('volume-down').click()
  await page.getByTestId('volume-down').click()
  await expect(volumeSlider(page)).toHaveValue('39')
})

test('sleep timer counts down, extends, and stops playback', async ({ page }) => {
  await page.getByTestId('open-timer').click()
  const dialog = page.locator('#timer-sheet')
  await dialog.locator('input[name="timer"][value="-1"]').check() // Custom
  await expect(dialog.locator('#custom-timer')).toHaveValue('120')
  await dialog.getByTestId('sheet-close').click()

  await page.getByTestId('play').click()
  await expectPlaying(page)
  await expect.poll(() => timerMinutesLeft(page)).toBeGreaterThan(119)
  expect(await timerMinutesLeft(page)).toBeLessThanOrEqual(120)

  await page.getByTestId('open-timer').click()
  await dialog.getByTestId('timer-extend').click()
  await expect.poll(() => timerMinutesLeft(page)).toBeGreaterThan(134)
  await dialog.getByTestId('sheet-close').click()

  // Shorten the running timer to 1 s via the engine, as a real wait would take hours.
  await page.evaluate(() => (window as any).benGen.engine.startSleepTimer(1, 0.5))
  await expectStatus(page, 'stopped', 5000)
})

test('favorites: save, replay, remove', async ({ page }) => {
  await soundRadio(page, 'fire').check()
  const star = page.getByTestId('favorite')
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'true')

  const saved = page.locator('[data-testid="favorite-item"][data-sound="fire"]')
  await soundRadio(page, 'bright').check()
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await saved.click()
  await expectPlaying(page, 'fire')
  await expect(soundRadio(page, 'fire')).toBeChecked()

  // Removing asks first, and can be cancelled.
  await page.getByTestId('favorites-edit').click()
  await page.getByTestId('favorite-remove').click()
  await page.getByTestId('favorite-remove-cancel').click()
  await expect(saved).toHaveCount(1)
  await expect(page.getByTestId('favorite-remove')).toBeFocused()
  await page.getByTestId('favorite-remove').click()
  await page.getByTestId('favorite-remove-confirm').click()
  await expect(saved).toHaveCount(0)
  await expect(page.getByTestId('favorite-remove-confirm')).toHaveCount(0)
})

test('adjust sheet: intensity and tone are saved per sound', async ({ page }) => {
  const dialog = page.locator('#adjust-sheet')
  await soundRadio(page, 'rain').check()
  await page.getByTestId('open-adjust').click()
  await expect(dialog).toBeVisible()
  await dialog.locator('#intensity').fill('80')
  await dialog.locator('#tilt').fill('-30')
  await expect(dialog.locator('#tilt')).toHaveValue('-30')
  await page.keyboard.press('Escape')

  // Another sound keeps its own defaults.
  await soundRadio(page, 'ocean').check()
  await page.getByTestId('open-adjust').click()
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('#intensity')).toHaveValue('50')
  await page.keyboard.press('Escape')

  await soundRadio(page, 'rain').check()
  await page.getByTestId('open-adjust').click()
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('#intensity')).toHaveValue('80')
  await dialog.getByTestId('adjust-reset').click()
  await expect(dialog.locator('#intensity')).toHaveValue('50')
})

test('adjust sheet: Train and Airplane have their own extra sliders', async ({ page }) => {
  const dialog = page.locator('#adjust-sheet')
  const open = async (sound: string) => {
    await soundRadio(page, sound).check()
    await page.getByTestId('open-adjust').click()
    await expect(dialog).toBeVisible()
  }

  // Sounds without extras don't show any.
  await open('rain')
  await expect(dialog.locator('[id^="extra-"]')).toHaveCount(0)
  await page.keyboard.press('Escape')

  await open('train')
  await expect(dialog.locator('#extra-bumpRandomness')).toHaveValue('0')
  await expect(dialog.locator('#extra-bumpVolume')).toHaveValue('50')
  await dialog.locator('#extra-bumpRandomness').fill('70')
  await dialog.locator('#extra-bumpVolume').fill('90')
  await page.keyboard.press('Escape')

  await open('airplane')
  await expect(dialog.locator('#extra-engineVolume')).toHaveValue('50')
  await dialog.locator('#extra-engineVolume').fill('20')
  await page.keyboard.press('Escape')

  // Each sound keeps its own, and Reset puts them back.
  await open('train')
  await expect(dialog.locator('#extra-bumpRandomness')).toHaveValue('70')
  await expect(dialog.locator('#extra-bumpVolume')).toHaveValue('90')
  await dialog.getByTestId('adjust-reset').click()
  await expect(dialog.locator('#extra-bumpRandomness')).toHaveValue('0')
  await expect(dialog.locator('#extra-bumpVolume')).toHaveValue('50')
  await page.keyboard.press('Escape')
  await open('airplane')
  await expect(dialog.locator('#extra-engineVolume')).toHaveValue('20')
})

test('adjust sheet: extra sliders reach the playing sound and favorites', async ({ page }) => {
  const dialog = page.locator('#adjust-sheet')
  await soundRadio(page, 'train').check()
  await page.getByTestId('play').click()
  await expectPlaying(page, 'train')
  await page.getByTestId('open-adjust').click()
  await dialog.locator('#extra-bumpVolume').fill('80')
  await page.keyboard.press('Escape')
  await page.getByTestId('favorite').click()
  const saved = page.locator('[data-testid="favorite-item"][data-sound="train"]')
  await expect(saved).toHaveCount(1)

  // Changing the extra means the current mix is no longer the saved one.
  await page.getByTestId('open-adjust').click()
  await dialog.locator('#extra-bumpVolume').fill('30')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('favorite')).toHaveAttribute('aria-pressed', 'false')
  await saved.click()
  await expect(page.getByTestId('favorite')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('open-adjust').click()
  await expect(dialog.locator('#extra-bumpVolume')).toHaveValue('80')
})

test('manifest shortcut URL pre-selects a sound', async ({ page }) => {
  await page.goto('./?sound=stream')
  await expect(soundRadio(page, 'stream')).toBeChecked()
  expect(page.url()).not.toContain('sound=')
})

test('theme setting overrides the system theme and persists', async ({ page }) => {
  const theme = (value: string) => page.locator(`input[name="theme"][value="${value}"]`)
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.getByTestId('open-settings').click()
  await theme('light').check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByTestId('open-settings').click()
  await theme('system').check()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme')
})

test('install card appears when the browser offers installation', async ({ page }) => {
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt') as any
    event.prompt = () => {
      ;(window as any).installPrompted = true
      return Promise.resolve()
    }
    event.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(event)
  })
  const card = page.getByTestId('install-card')
  await expect(card).toBeVisible()
  await card.getByTestId('install').click()
  await expect.poll(() => page.evaluate(() => (window as any).installPrompted)).toBe(true)
  await expect(card).toBeHidden()
})

test('Apple install card appears on iOS with Share instructions and dismisses', async ({
  browser,
}) => {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  })
  const page = await context.newPage()
  await skipOnboarding(page)
  await page.goto('./')

  const card = page.getByTestId('apple-install-card')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Share')
  await expect(card).toContainText('Add to Home Screen')

  const dismissBtn = card.getByTestId('apple-install-dismiss')
  await expect(dismissBtn).toHaveText('Dismiss')
  await dismissBtn.click()
  await expect(card).toBeHidden()

  // Setting persists across reload
  await page.reload()
  await expect(card).toBeHidden()

  // In settings, the hint guides iOS users
  await page.getByTestId('open-settings').click()
  await expect(page.locator('#settings-sheet')).toContainText(
    'Tap Share in Safari, then choose “Add to Home Screen”.',
  )

  await context.close()
})

test('Apple install card appears on macOS Safari with Add to Dock instructions', async ({
  browser,
}) => {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  })
  const page = await context.newPage()
  await skipOnboarding(page)
  await page.goto('./')

  const card = page.getByTestId('apple-install-card')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Add to Dock')

  // In settings, the hint guides macOS Safari users
  await page.getByTestId('open-settings').click()
  await expect(page.locator('#settings-sheet')).toContainText(
    'In Safari, choose File → Add to Dock…',
  )
  await page.keyboard.press('Escape')

  await card.getByTestId('apple-install-dismiss').click()
  await expect(card).toBeHidden()

  await context.close()
})

test('Apple install card has no accessibility violations', async ({ browser }) => {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  })
  const page = await context.newPage()
  await skipOnboarding(page)
  await page.goto('./')

  await expect(page.getByTestId('apple-install-card')).toBeVisible()
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(results.violations).toEqual([])

  await context.close()
})

test.describe('playback mode accessibility', () => {
  test('has no accessibility violations in the playback mode section', async ({ page }) => {
    await page.getByTestId('open-settings').click()
    await outputRadio(page, 'direct').check()
    await expect(page.locator('#with-media')).toBeVisible()
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished),
      ),
    )
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
})

for (const colorScheme of ['dark', 'light'] as const) {
  test(`has no accessibility violations (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    const scan = async () => {
      // Let one-off animations (a sheet sliding in) finish, or axe measures
      // half-faded colours. Endless decorative ones (breathing rings) are skipped.
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((a) => a.effect?.getTiming().iterations !== Infinity)
            .map((a) => a.finished),
        ),
      )
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(results.violations).toEqual([])
    }
    const openDialog = page.locator('dialog[open]')
    await soundRadio(page, 'rain').check()
    await page.getByTestId('favorite').click()
    await page.getByTestId('play').click()
    await scan()
    for (const opener of ['open-timer', 'open-adjust', 'open-settings']) {
      await page.getByTestId(opener).click()
      await expect(openDialog).toBeVisible()
      // Expand collapsed sections (help, about) so they're scanned too.
      await openDialog.evaluate((d) =>
        d.querySelectorAll('details').forEach((x) => (x.open = true)),
      )
      await scan()
      await page.keyboard.press('Escape')
      await expect(openDialog).toHaveCount(0)
    }
    // Verify Onboarding dialog accessibility
    await page.getByTestId('open-settings').click()
    await page.getByTestId('replay-tour').click()
    await expect(page.locator('#onboarding-dialog')).toBeVisible()
    await scan()
    await page.getByTestId('onboarding-skip').click()
    await expect(page.locator('#onboarding-dialog')).toBeHidden()
  })
}

test('first-time onboarding: appears with animated wave background, samples sounds, and completes', async ({
  page,
}) => {
  // Clear any existing stored settings so it acts as an authentic first-time visit
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const dialog = page.locator('#onboarding-dialog')
  await expect(dialog).toBeVisible()

  // Verify the SVG tactile waves background is animating
  await expect(dialog.locator('.tactile-wave-bg')).toBeVisible()
  await expect(dialog.locator('.tactile-wave-svg path animate')).toHaveCount(5)

  // Step 1: Interactive sound sampling
  await expect(dialog.locator('[data-slide="1"]')).toBeVisible()
  const rainSample = dialog.locator('[data-testid="onboarding-sample"][data-sound="rain"]')
  await expect(rainSample).toBeVisible()

  // Sample rain sound
  await rainSample.click()
  await expect(rainSample).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => level(page), { timeout: 5000 }).toBeGreaterThan(-60)

  // Stop sampling rain
  await rainSample.click()
  await expect(rainSample).toHaveAttribute('aria-pressed', 'false')

  await dialog.getByTestId('onboarding-next').click()

  // Step 2: Daily routine & features
  await expect(dialog.locator('[data-slide="2"]')).toBeVisible()

  // Finish onboarding
  await dialog.getByTestId('onboarding-finish').click()
  await expect(dialog).toBeHidden()

  // Verify settings persisted so onboarding does not reopen on reload
  await page.reload()
  await expect(page.locator('#onboarding-dialog')).toBeHidden()
  await expectStatus(page, 'stopped')
})

test('re-opening onboarding tour from Settings', async ({ page }) => {
  await page.getByTestId('open-settings').click()
  await page.getByTestId('replay-tour').click()
  const dialog = page.locator('#onboarding-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.tactile-wave-bg')).toBeVisible()
  await dialog.getByTestId('onboarding-skip').click()
  await expect(dialog).toBeHidden()
})

test('works offline after the first visit', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('play')).toBeVisible()
  await page.getByTestId('play').click()
  await expect.poll(() => level(page), { timeout: 5000 }).toBeGreaterThan(-60)
})
