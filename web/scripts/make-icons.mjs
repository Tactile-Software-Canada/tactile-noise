// Renders every icon from the two source drawings in public/icons:
//   icon.svg      rounded-square app icon (transparent corners)
//   maskable.svg  full-bleed square, for maskable/adaptive icons and the Play Store
// Outputs: the PWA icons and favicons, the Android launcher icons and splash screens, and the
// Play Store feature graphic. Android notification icons are hand-made monochrome art and are
// left alone.
// Usage: npm run icons   (uses Playwright's Chromium; set CHROMIUM_PATH to use another browser)
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url))
const web = path('../public/')
const res = path('../../android/app/src/main/res/')
const playStore = path('../../android/play-store/')
const app = JSON.parse(readFileSync(path('../../app.config.json'), 'utf8'))

const icon = readFileSync(web + 'icons/icon.svg', 'utf8')
const maskable = readFileSync(web + 'icons/maskable.svg', 'utf8')

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
const page = await browser.newPage()

/** Renders `svg` to a size×size PNG; `round` clips it to a circle. */
async function render(svg, size, round = false) {
  // A fixed viewport and an element screenshot: resizing the viewport between captures can
  // return a half-repainted frame.
  await page.setViewportSize({ width: 1280, height: 1280 })
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}` +
      `#icon{width:${size}px;height:${size}px;overflow:hidden;border-radius:${round ? '50%' : '0'}}` +
      `#icon svg{display:block;width:100%;height:100%}</style><div id="icon">${svg}</div>`,
  )
  return page.locator('#icon').screenshot({ omitBackground: true, animations: 'disabled' })
}

function write(file, data) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, data)
  console.log('wrote', file.replace(path('../../'), ''))
}

/** Packs PNGs into a .ico (PNG-compressed entries, supported since Windows Vista). */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  let offset = header.length
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i
    header.writeUInt8(size % 256, e)
    header.writeUInt8(size % 256, e + 1)
    header.writeUInt16LE(1, e + 4)
    header.writeUInt16LE(32, e + 6)
    header.writeUInt32LE(data.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...pngs.map((p) => p.data)])
}

// ---- PWA ----
for (const size of [192, 512]) {
  write(`${web}icons/icon-${size}.png`, await render(icon, size))
  write(`${web}icons/maskable-${size}.png`, await render(maskable, size))
}
const favicons = []
for (const size of [16, 32, 48]) {
  const data = await render(icon, size)
  favicons.push({ size, data })
  write(`${web}favicon-${size}x${size}.png`, data)
}
write(`${web}favicon.ico`, ico(favicons))
// iOS draws its own rounded corners, so it gets the full-bleed drawing.
write(`${web}apple-touch-icon.png`, await render(maskable, 180))

// ---- Android (TWA) ----
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
for (const [density, scale] of Object.entries(densities)) {
  const mipmap = `${res}mipmap-${density}/`
  write(mipmap + 'ic_launcher.png', await render(icon, 48 * scale))
  write(mipmap + 'ic_launcher_round.png', await render(maskable, 48 * scale, true))
  // Adaptive icon background layer (108dp; the launcher masks it).
  write(mipmap + 'ic_maskable.png', await render(maskable, 108 * scale))
  write(`${res}drawable-${density}/splash.png`, await render(icon, 300 * scale))
}

// ---- Play Store ----
// The store icon is public/icons/maskable-512.png (512×512, opaque), so it isn't duplicated here.
await page.setViewportSize({ width: 1024, height: 500 })
await page.setContent(`
  <style>
    html, body {
      margin: 0; width: 1024px; height: 500px; overflow: hidden; box-sizing: border-box;
      padding: 0 72px; display: flex; align-items: center; justify-content: space-between;
      background: radial-gradient(circle at 75% 50%, #1d2530 0%, ${app.backgroundColor} 70%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    .text { max-width: 500px; }
    h1 { margin: 0 0 12px; font-size: 56px; font-weight: 700; color: #ece9e3; letter-spacing: -0.02em; }
    p { margin: 0; font-size: 22px; line-height: 1.45; color: #aeb6c1; }
    .pill {
      display: inline-block; margin-top: 24px; padding: 6px 16px; border-radius: 999px;
      border: 1px solid #323d4c; color: #ece9e3; font-size: 14px; font-weight: 500;
      letter-spacing: 0.04em; text-transform: uppercase;
    }
    .icon { width: 320px; height: 320px; filter: drop-shadow(0 20px 40px rgba(0, 0, 0, 0.6)); }
    .icon svg { display: block; width: 100%; height: 100%; }
  </style>
  <div class="text">
    <h1>${app.name}</h1>
    <p>${app.description}</p>
    <div class="pill">100% offline · No data collected</div>
  </div>
  <div class="icon">${icon}</div>
`)
write(playStore + 'feature-graphic.png', await page.screenshot())

await browser.close()
