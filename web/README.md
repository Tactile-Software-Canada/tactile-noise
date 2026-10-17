# Tactile Noise: the PWA

An installable, fully offline Progressive Web App, built for Chrome and Firefox on Android
(desktop browsers work too). All fourteen sounds are generated live on the device in an
AudioWorklet, so the app makes no network requests after it's installed.

**Features:** one-tap play with fade-in; 14 sounds in three groups (noise, nature, machines
and travel); fine volume with ±1% buttons and a quieter "media is playing" volume; per-sound
intensity and tone; sleep timer with fade-out, end time and +15 min; up to six favorites;
media controls in the notification shade and lock screen (with next/previous sound);
light/dark/system theme; a large audio buffer for gap-free playback on slower phones (by design, controls respond ~0.3 s later); install prompt and home-screen shortcuts; updates that wait until
nothing is playing; diagnostics.

## Develop

Requires Node 22+.

```sh
npm install
npm run dev          # http://localhost:5173 with hot reload
```

| Command                      | What it does                                                            |
| ---------------------------- | ----------------------------------------------------------------------- |
| `npm run build`              | Type-check and build to `dist/` (with service worker + manifest)        |
| `npm run preview`            | Serve the production build on http://localhost:4173                     |
| `npm test`                   | DSP, golden-spectrum and settings unit tests (Vitest)                   |
| `npm run test:e2e`           | Playwright end-to-end + axe accessibility tests against the build       |
| `npm run test:golden:update` | Rewrite `/spec/sounds/golden` after an intentional sound change         |
| `npm run calibrate`          | Print loudness, peak and suggested trim for each sound                  |
| `npm run deploy:preview`     | Build and upload a new version with its own preview URL (not live)      |
| `npm run deploy`             | Build and publish to the Cloudflare Worker (see below)                  |
| `npm run screenshots`        | Re-render the install-dialog screenshots (needs `npm run preview`)      |
| `npm run icons`              | Re-render every PNG icon (web, Android, Play) from `public/icons/*.svg` |
| `npm run format`             | Prettier                                                                |

E2E tests need Chromium: `npx playwright install chromium`, or point at an existing one with
`CHROMIUM_PATH=/path/to/chromium`.

### Layout

```
src/audio/dsp/          pure, platform-free DSP: rng, filters, noise, voices, block base
src/audio/dsp/sounds/   one module per sound recipe
src/audio/worklet.ts    AudioWorkletProcessor: warm-up, one generator per node, load stats
src/audio/engine.ts     Web Audio graph, fades, crossfades, sleep timer, media element, diagnostics
src/pwa.ts              install prompt and (prompted) service-worker updates
src/settings.ts         persisted settings (localStorage), validated on load
src/sounds.ts           sound catalog: names, categories, icons, intensity labels
src/ui/                 Preact UI: App, NowPlaying, SoundGrid, Favorites, sheets, controls
test/                   Vitest (DSP, golden spectra, real-time safety, settings); e2e/ Playwright
```

## Deploy (Cloudflare Worker)

Live at **https://noise.tactile.software** (Worker `ben-gen` with that custom domain, static
assets only, see `wrangler.jsonc`).

```sh
export CLOUDFLARE_ACCOUNT_ID=…  CLOUDFLARE_API_TOKEN=…

# 1. Preview: upload a new version without making it live. Wrangler prints a
#    "Version Preview URL" (https://<version>-ben-gen.<subdomain>.workers.dev) and the
#    Version ID. The live URL keeps serving the current version.
npm run deploy:preview

# 2. Go live with exactly that version once it looks right…
npx wrangler versions deploy <version-id>@100 -y
#    …or build and deploy the current code in one step:
npm run deploy
```

A preview URL is its own origin, so installing it, its offline cache and its saved settings
are separate from the live app.

To run the browser tests against a deployed copy (a preview or the live URL), set
`BASE_URL`: `BASE_URL=https://<version>-ben-gen.<subdomain>.workers.dev/ npm run test:e2e`.

`public/_headers` stops the service worker and manifest being cached, so installed copies
pick up new versions on their next launch with a connection.

The build also writes `dist/.well-known/assetlinks.json` from `../app.config.json`. It
lists the Play app's signing-key fingerprints, and Chrome checks it before opening the
Play app full-screen.

The app is public: it's also sold on Google Play as a Trusted Web Activity (see
[`../android/README.md`](../android/README.md)), and that app opens this site. Don't put a
login (such as Cloudflare Access) in front of the live domain: the Play app would show the
login page, and Chrome couldn't fetch `/.well-known/assetlinks.json` to verify it.

## Install on Android

1. Open the URL in Chrome.
2. Menu (⋮) → **Add to home screen** → **Install**.
3. Long-press the new icon for shortcuts (Rain, Ocean, Dark noise, Balanced noise). Browsers
   need a tap before sound can start, so a shortcut opens the app with that sound selected;
   press Play.

### Media controls and playing with the screen off

In the default **Settings → Playback mode → With media controls**, the app also loops a
10-second, inaudible `<audio>` file (an 8 Hz tone at −54 dBFS, see
`src/audio/keepalive.ts`). Chrome and Firefox only show notification, lock-screen and
headset controls for a real media element playing something longer than 5 seconds; Web Audio
and MediaStream playback get none. That element also makes the browser treat the page as
playing media, which helps keep it running with the screen off. The trade-off: starting music
or a video in another app may stop the sound. **Mix with other audio** skips the element, so
it keeps playing alongside other apps, but without media controls. The Playback mode
setting is shown only on Android, the one platform where mixing works.

Some phones (Samsung, Xiaomi, OnePlus…) still stop background apps aggressively:

- Settings → Apps → Chrome (or Firefox) → Battery → **Unrestricted** (and the same for the
  installed app if it's listed separately).

**iOS/WebKit-only quirk:** the app sets `navigator.audioSession.type = "playback"`, which
only WebKit (Safari, and every browser on iOS) understands. It stops the iPhone's silent
switch from muting the sound. It has no effect on Android or desktop browsers, and iOS isn't
a target platform otherwise.

If it still cuts out overnight, open Settings → Diagnostics while it plays and note the numbers.
A native Android app (with a foreground service) is the only fix beyond that, and isn't
currently planned (see `docs/PLAN.md` §5). The Play Store app doesn't change this: it runs this
same PWA in Chrome.
