// Renders the store-style screenshots used by the install dialog (manifest
// "screenshots"). Run against a production preview:
//   npm run build && npm run preview   (in another terminal)
//   npm run screenshots
import { chromium, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const out = fileURLToPath(new URL('../public/screenshots/', import.meta.url))
const url = process.env.URL ?? 'http://localhost:4173/'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--autoplay-policy=no-user-gesture-required'],
})

async function open(options) {
  const context = await browser.newContext({
    ...options,
    colorScheme: 'dark',
    serviceWorkers: 'block',
  })
  const page = await context.newPage()
  await page.goto(url)
  return page
}

const phone = { ...devices['Pixel 7'], deviceScaleFactor: 2.625 }
let page = await open(phone)
await page.getByRole('radio', { name: /Rain/ }).check()
await page.getByTestId('play').click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}phone-playing.jpg`, type: 'jpeg', quality: 82 })

await page.getByRole('button', { name: /Sleep timer/ }).click()
await page.getByRole('radio', { name: '45 min' }).check()
await page.waitForTimeout(500)
await page.screenshot({ path: `${out}phone-timer.jpg`, type: 'jpeg', quality: 82 })

page = await open({ viewport: { width: 1280, height: 800 } })
await page.getByRole('radio', { name: /Ocean/ }).check()
await page.getByTestId('play').click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}desktop.jpg`, type: 'jpeg', quality: 82 })

await browser.close()
console.log('wrote screenshots to', out)
