import preact from '@preact/preset-vite'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}
// App identity shared with the Android TWA (android/app/build.gradle reads the same file).
const app = JSON.parse(readFileSync(new URL('../app.config.json', import.meta.url), 'utf8')) as {
  name: string
  shortName: string
  description: string
  themeColor: string
  backgroundColor: string
  android: { packageId: string; sha256CertFingerprints: string[] }
}
const buildDate = new Date().toISOString().slice(0, 10)

const shortcut = (name: string, sound: string) => ({
  name: `Play ${name}`,
  short_name: name,
  url: `./?sound=${sound}`,
  icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
})

/** Fills %APP_NAME% and %APP_DESCRIPTION% in index.html. */
function appIdentityHtml(): Plugin {
  return {
    name: 'app-identity-html',
    transformIndexHtml: (html) =>
      html.replaceAll('%APP_NAME%', app.name).replaceAll('%APP_DESCRIPTION%', app.description),
  }
}

/** Digital Asset Links: lets the Play Store app open this site full-screen as a TWA. */
function assetLinks(): Plugin {
  const statements = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: app.android.packageId,
        sha256_cert_fingerprints: app.android.sha256CertFingerprints,
      },
    },
  ]
  return {
    name: 'asset-links',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '.well-known/assetlinks.json',
        source: JSON.stringify(statements, null, 2) + '\n',
      })
    },
  }
}

export default defineConfig({
  // Relative base so the build works from any path (root domain or sub-folder).
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version} (${buildDate})`),
  },
  plugins: [
    appIdentityHtml(),
    assetLinks(),
    preact({
      exclude: [/node_modules/, /src\/audio\//],
    }),
    VitePWA({
      // Updates wait for the user (see src/pwa.ts): never reload mid-sleep.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.svg', 'icons/*.png', '*.png', 'favicon.ico'],
      manifest: {
        id: './',
        name: app.name,
        short_name: app.shortName,
        description: app.description,
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: app.backgroundColor,
        theme_color: app.themeColor,
        categories: ['health', 'lifestyle', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        // Shown in Android's richer install dialog (and desktop Chrome's).
        screenshots: [
          {
            src: 'screenshots/phone-playing.jpg',
            sizes: '1082x2202',
            type: 'image/jpeg',
            form_factor: 'narrow',
            label: 'Playing Rain, with volume, sleep timer and favorites',
          },
          {
            src: 'screenshots/phone-timer.jpg',
            sizes: '1082x2202',
            type: 'image/jpeg',
            form_factor: 'narrow',
            label: 'Sleep timer with a gentle fade-out',
          },
          {
            src: 'screenshots/desktop.jpg',
            sizes: '1280x800',
            type: 'image/jpeg',
            form_factor: 'wide',
            label: 'All fourteen sounds on a larger screen',
          },
        ],
        shortcuts: [
          shortcut('Rain', 'rain'),
          shortcut('Ocean', 'ocean'),
          shortcut('Dark noise', 'dark'),
          shortcut('Balanced noise', 'balanced'),
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Store-style screenshots are only for the install dialog; don't cache them.
        globIgnores: ['screenshots/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  worker: { format: 'es' },
  build: { target: 'es2022' },
})
