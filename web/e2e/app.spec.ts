import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/** Output level (dBFS RMS) measured inside the page's audio graph. */
const level = (page: Page) =>
  page.evaluate(() => (window as any).benGen.engine.measureDb() as number)

const status = (page: Page) => page.getByTestId('status')
const volumeSlider = (page: Page) => page.getByRole('slider', { name: 'Volume', exact: true })

test.beforeEach(async ({ page }, testInfo) => {
  if (!testInfo.title.includes('first-time onboarding')) {
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
  }
  await page.goto('./')
})

test('plays, switches sound, and stops', async ({ page }) => {
  await expect(status(page)).toHaveText('Stopped')
  await page.getByTestId('play').click()
  await expect(status(page)).toHaveText(/Playing Balanced/)
  // Audio actually flows through the worklet and graph.
  await expect.poll(() => level(page), { timeout: 5000 }).toBeGreaterThan(-60)

  await page.getByRole('radio', { name: /Rain/ }).check()
  await expect(status(page)).toHaveText(/Playing Rain/)
  await expect(page.getByRole('heading', { name: 'Rain', level: 2 })).toBeVisible()
  await expect.poll(() => level(page)).toBeGreaterThan(-60)

  await page.getByRole('button', { name: /Stop/ }).click()
  await expect(status(page)).toHaveText('Stopped')
})

test('every sound plays', async ({ page }) => {
  await page.getByTestId('play').click()
  const radios = page.getByRole('radio', { name: /./ }).and(page.locator('[name=sound]'))
  const count = await radios.count()
  expect(count).toBe(14)
  for (let i = 0; i < count; i++) {
    await radios.nth(i).check()
    await expect(status(page)).toHaveText(/Playing/)
    await expect.poll(() => level(page), { timeout: 5000 }).toBeGreaterThan(-60)
  }
})

test('switching playback mode mid-playback keeps playing', async ({ page }) => {
  const output = page.getByRole('combobox', { name: 'Playback mode' })
  await page.getByRole('button', { name: 'Settings' }).click()
  await output.selectOption('direct')
  await page.keyboard.press('Escape')
  await page.getByTestId('play').click()
  await expect.poll(() => level(page), { timeout: 5000 }).toBeGreaterThan(-60)
  await page.getByRole('button', { name: 'Settings' }).click()
  await output.selectOption('media')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1500)
  await expect(page.getByTestId('status')).toHaveText(/Playing Balanced/)
  await expect.poll(() => level(page)).toBeGreaterThan(-60)
})

test('remembers settings across reloads', async ({ page }) => {
  await page.getByRole('radio', { name: /Ocean/ }).check()
  await volumeSlider(page).fill('63')
  await page.getByRole('button', { name: /Sleep timer/ }).click()
  await page.getByRole('radio', { name: '30 min' }).check()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.reload()
  await expect(page.getByRole('radio', { name: /Ocean/ })).toBeChecked()
  await expect(volumeSlider(page)).toHaveValue('63')
  await expect(page.getByRole('button', { name: /Sleep timer/ })).toContainText('30 min')
})

test('volume step buttons move by 1%', async ({ page }) => {
  await page.getByRole('button', { name: 'Volume: up' }).click()
  await expect(volumeSlider(page)).toHaveValue('41')
  await page.getByRole('button', { name: 'Volume: down' }).click()
  await page.getByRole('button', { name: 'Volume: down' }).click()
  await expect(volumeSlider(page)).toHaveValue('39')
})

test('sleep timer counts down, extends, and stops playback', async ({ page }) => {
  await page.getByRole('button', { name: /Sleep timer/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Sleep timer' })
  await dialog.getByRole('radio', { name: 'Custom' }).check()
  await expect(dialog.getByLabel('Minutes', { exact: true })).toHaveValue('120')
  await dialog.getByRole('button', { name: 'Close' }).click()

  await page.getByTestId('play').click()
  await expect(status(page)).toContainText('stops at')
  await expect(page.getByRole('button', { name: /Sleep timer/ })).toContainText('2 h 00 min')

  await page.getByRole('button', { name: /Sleep timer/ }).click()
  await dialog.getByRole('button', { name: '15 min', exact: true }).click()
  await expect(dialog).toContainText('2 h 15 min')
  await dialog.getByRole('button', { name: 'Close' }).click()

  // Shorten the running timer to 1 s via the engine, as a real wait would take hours.
  await page.evaluate(() => (window as any).benGen.engine.startSleepTimer(1, 0.5))
  await expect(status(page)).toHaveText('Stopped', { timeout: 5000 })
})

test('favorites: save, replay, remove', async ({ page }) => {
  await page.getByRole('radio', { name: /Fire/ }).check()
  const star = page.getByRole('button', { name: 'Favorite' })
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('radio', { name: /Bright/ }).check()
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: /^Fire · 40%/ }).click()
  await expect(status(page)).toHaveText(/Playing Fire/)
  await expect(page.getByRole('radio', { name: /Fire/ })).toBeChecked()

  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('button', { name: /Remove favorite Fire/ }).click()
  await expect(page.getByRole('button', { name: /^Fire · 40%/ })).toHaveCount(0)
})

test('adjust sheet: intensity and tone are saved per sound', async ({ page }) => {
  await page.getByRole('radio', { name: /Rain/ }).check()
  await page.getByRole('button', { name: 'Adjust' }).click()
  const dialog = page.getByRole('dialog', { name: 'Adjust Rain' })
  await dialog.getByRole('slider', { name: 'Rainfall' }).fill('80')
  await dialog.getByRole('slider', { name: 'Tone' }).fill('-30')
  await expect(dialog.getByRole('slider', { name: 'Tone' })).toHaveAttribute(
    'aria-valuetext',
    'Warmer 30%',
  )
  await page.keyboard.press('Escape')

  // Another sound keeps its own defaults.
  await page.getByRole('radio', { name: /Ocean/ }).check()
  await page.getByRole('button', { name: 'Adjust' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Adjust Ocean' }).getByRole('slider', { name: 'Wave size' }),
  ).toHaveValue('50')
  await page.keyboard.press('Escape')

  await page.getByRole('radio', { name: /Rain/ }).check()
  await page.getByRole('button', { name: 'Adjust' }).click()
  await expect(dialog.getByRole('slider', { name: 'Rainfall' })).toHaveValue('80')
  await dialog.getByRole('button', { name: 'Reset to default' }).click()
  await expect(dialog.getByRole('slider', { name: 'Rainfall' })).toHaveValue('50')
})

test('keyboard shortcuts', async ({ page }) => {
  const body = page.locator('body')
  await body.press('5')
  await expect(page.getByRole('radio', { name: /Rain/ })).toBeChecked()
  await body.press(']')
  await expect(page.getByRole('radio', { name: /Ocean/ })).toBeChecked()
  await body.press('[')
  await expect(page.getByRole('radio', { name: /Rain/ })).toBeChecked()
  await body.press('Space')
  await expect(status(page)).toHaveText(/Playing Rain/)
  await body.press('ArrowUp')
  await expect(volumeSlider(page)).toHaveValue('45')
  await body.press('Space')
  await expect(status(page)).toHaveText('Stopped')
  await body.press('t')
  await expect(page.getByRole('dialog', { name: 'Sleep timer' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Sleep timer' })).toBeHidden()
})

test('manifest shortcut URL pre-selects a sound', async ({ page }) => {
  await page.goto('./?sound=stream')
  await expect(page.getByRole('radio', { name: /Stream/ })).toBeChecked()
  expect(page.url()).not.toContain('sound=')
})

test('theme setting overrides the system theme and persists', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('radio', { name: 'Light' }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('radio', { name: 'System' }).check()
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
  const card = page.getByRole('region', { name: 'Install the app' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Install' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).installPrompted)).toBe(true)
  await expect(card).toBeHidden()
})

test('diagnostics report generator load while playing', async ({ page }) => {
  await page.getByTestId('play').click()
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByText('Audio engine').click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await expect(dialog).toContainText('running')
  await expect(dialog).toContainText(/% of real time/, { timeout: 5000 })
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
    await page.getByRole('radio', { name: /Rain/ }).check()
    await page.getByRole('button', { name: 'Favorite' }).click()
    await page.getByTestId('play').click()
    await scan()
    for (const name of [/Sleep timer/, 'Adjust', 'Settings']) {
      await page.getByRole('button', { name }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      if (name === 'Settings') {
        await page.getByText('Audio engine').click()
        await page.getByText('Keyboard shortcuts').click()
      }
      await scan()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toBeHidden()
    }
    // Verify Onboarding dialog accessibility
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Replay tour' }).click()
    await expect(page.locator('#onboarding-dialog')).toBeVisible()
    await scan()
    await page.getByRole('button', { name: 'Skip onboarding' }).click()
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
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(/14 Handcrafted Soundscapes/)
  const rainSample = dialog.getByRole('button', { name: /Rain/ })
  await expect(rainSample).toBeVisible()

  // Sample rain sound
  await rainSample.click()
  await expect(rainSample).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => level(page), { timeout: 5000 }).toBeGreaterThan(-60)

  // Stop sampling rain
  await rainSample.click()
  await expect(rainSample).toHaveAttribute('aria-pressed', 'false')

  await dialog.getByRole('button', { name: 'Continue' }).click()

  // Step 2: Daily routine & features
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(
    /Crafted for your daily routine/,
  )

  // Finish onboarding
  await dialog.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(dialog).toBeHidden()

  // Verify settings persisted so onboarding does not reopen on reload
  await page.reload()
  await expect(page.locator('#onboarding-dialog')).toBeHidden()
  await expect(status(page)).toHaveText('Stopped')
})

test('re-opening onboarding tour from Settings', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Replay tour' }).click()
  const dialog = page.locator('#onboarding-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.tactile-wave-bg')).toBeVisible()
  await dialog.getByRole('button', { name: 'Skip onboarding' }).click()
  await expect(dialog).toBeHidden()
})

test('works offline after the first visit', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tactile Noise' })).toBeVisible()
  await page.getByTestId('play').click()
  await expect.poll(() => level(page), { timeout: 5000 }).toBeGreaterThan(-60)
})
