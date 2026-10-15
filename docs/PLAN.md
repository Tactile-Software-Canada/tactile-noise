# Ben's Noise Generator: Product & Technical Plan

Status: v5 (2026-10-11). **The PWA in [`web/`](../web) is the app.** Milestones 1–3 and 5 (plus
Airplane and Train from 7) are built and deployed at https://noise.tactile.software; see §6.
The native Android app is no longer planned (§5). The PWA is also published on Google Play as a
Trusted Web Activity (`android/`). Next: daily use on the phone (M4).

### Decisions so far
- **Name:** *Tactile Noise*. `tactile-noise` is the short form, used for the
  repo, package IDs (for example `noisegen`), and code.
- **The PWA is the core app** (decided 2026-10-11). It targets Chrome and Firefox on Android;
  desktop browsers work too. **iOS/Safari is not targeted.**
- **No native Android app.** It was planned as Phase 2, but the PWA covers the needs well enough
  (§5 records what native would have added, in case that changes).
- **Google Play via a Trusted Web Activity** (decided 2026-10-14): the Play app is a Bubblewrap
  shell around the live PWA, so there is one codebase. App identity (name, colours, host,
  package ID, signing fingerprints) lives once, in `app.config.json`.
- **Playback:** one sound at a time, like Apple's feature. Mixing is out of scope.
- **Large output buffer, always** (decided 2026-10-13): the app asks for ~0.3 s of audio
  buffering. Steady, gap-free sound matters more here than instant response; see §4.3.
- **Audience:** public. The source is open (GPL-3.0), the PWA is free on the web, and the
  Android app is sold on Google Play. §10 is the checklist for public distribution.
- **Inspiration:** Apple Background Sounds for the experience; Noice (Android) for features worth
  borrowing. See §2.1.

## 1. Goal

Build a background-sound generator for **accessibility** and **sleep**. It plays one continuous,
non-distracting sound (noise or nature ambience) that you can start in one tap, set a volume for,
put on a timer, and leave running while you use other apps or lock the screen.

The reference is Apple's **Background Sounds** (iOS/macOS: Settings → Accessibility → Audio &
Visual → Background Sounds). It ships as an installable **PWA**, which is the whole product (it
started as the MVP for a planned native Android app; see §5). Unlike Noice, everything works
**fully offline, with no paywall**.

### Needs it should serve

These are the needs the design is built around:

| Need | What they need from the app |
|---|---|
| Tinnitus masking | Steady broadband/shaped noise; precise, fine-grained volume; no sudden changes |
| ADHD / focus | Fast start; keeps playing alongside music or video at a separate, lower volume |
| Autism / sensory processing | Calm UI with no surprises; can mask unpredictable environmental noise |
| Sleep | Sleep timer with gentle fade-out; dark UI; works with the screen locked; low battery use |
| Low vision / motor impairment | Full screen-reader support, large targets, one-gesture toggle |

### Non-goals
- iOS / Safari support
- Mixing several sounds at once (one sound at a time is the product)
- A huge sound library or marketplace (we want a small, curated, high-quality set)
- Binaural beats or "brainwave" claims, or any medical claims
- Accounts, cloud sync, ads, payments, streaming from a server

## 2. Feature parity with Apple Background Sounds

The third column is what a native Android app would have added; it's no longer planned (§5).

| Apple feature | ben-gen (PWA) | Native Android (not planned) |
|---|---|---|
| Sound picker (Balanced, Bright, Dark, Ocean, Rain, Stream, …) | ✅ | ✅ |
| Background Sounds volume | ✅ | ✅ |
| "Use when media is playing" + separate volume | ⚠️ Partial: the browser can't detect other apps' audio; we provide a manual "with media" volume preset | ✅ Via `AudioPlaybackCallback` / audio focus |
| "Stop sounds when locked" | ❌ Not detectable on the web | ✅ `ACTION_SCREEN_OFF` |
| Control Center / accessibility shortcut toggle | ⚠️ PWA app shortcut + Media Session controls | ✅ **Quick Settings tile**, widget, accessibility shortcut |
| Timer (via Shortcuts/Focus on Apple) | ✅ Built-in sleep timer with fade-out | ✅ |

### 2.1 What to take from Noice

[Noice](https://github.com/trynoice/android-app) is an open-source (GPL-3.0) Android
ambient-sound app. It plays **recorded clips streamed from its own server**. Full offline
playback, higher bitrates, extra clip variations and unlimited alarms are behind a paid
subscription. ben-gen avoids that problem by design: sounds are generated on the device, so
offline *is* the only mode and there's nothing to download or unlock.

| Noice feature | ben-gen take |
|---|---|
| Sleep timer | ✅ MVP (with a long fade-out) |
| Wake-up **alarms** that start a sound and fade in | ❌ Not reliable in a PWA, and the native app that would have done it is dropped |
| "Sound variations generated on demand" (randomized clip sequencing so it doesn't repeat) | ✅ We get this for free: procedural sounds never repeat |
| Per-sound volume and **presets** (saved mixes) | Adapted: one sound at a time, so a "preset" is a **favorite**: a sound plus its volume, intensity, and tilt. Up to ~6 favorites as one-tap chips. |
| Media session, notification, and headset controls | ✅ Media Session (with next/previous sound) |
| Large catalog of recorded sounds | ❌ We keep a small procedural set (§3) |
| Mixing many sounds | ❌ Out of scope (decision above) |
| Chromecast, accounts, subscription | ❌ Not needed |

**License note:** this app is GPL-3.0 too, so Noice's code may be reused, provided its copyright
notices are kept and credited. Noice's sound recordings are
served from its own server and are **not** covered by the repo's license, so we don't reuse them.

Optional features beyond Apple's, roughly in order of value:
1. Built-in **sleep timer** with a long fade-out (Apple has no first-class timer).
2. **Tone shaping**: a single "warmth" slider (dark ↔ bright tilt) on every sound.
3. **Fade-in** on start (hearing comfort; prevents being startled).
4. **Favorites**: saved sound + settings, one tap to play (Noice's presets, adapted).
5. ~~**Schedules and wake-up alarms**~~: needed a native app (not reliable in a PWA), so dropped
   with it.

## 3. Sound strategy: procedural first

**Recommendation: synthesize sounds in real time (procedural DSP), and use recorded loops only
where synthesis can't sound convincing (for example, Babble).**

Why procedural:
- **No audible loop seams or repetition.** People listen for hours; the brain picks out a
  30-second loop, which can disturb sleep and become irritating for tinnitus users.
- **Tiny footprint.** The whole app can be under 200 KB and work offline instantly. Ten
  high-quality one-minute recordings would be 10–20 MB.
- **Adjustable.** Rain intensity, ocean wave period, and tone tilt are just parameters.
- **Portable.** A sound is described by a recipe (§3.2) that could be re-implemented on another
  platform without asset licensing questions.

Trade-off: a few sounds (Babble, Train, Airplane cabin) sound much better as recordings. For those
we use recordings, played as long loops with a crossfade at the seam. **Prefer CC0** recordings
even though the app is private, so a later public release (§10) needs no asset audit. Keep a
`CREDITS.md` that lists each recording's source and license either way.

### 3.1 Catalog

| Sound | MVP | Method | Recipe (sketch) |
|---|---|---|---|
| **Balanced** | ✅ | Procedural | Pink noise (Voss-McCartney or Paul Kellet filter), −3 dB/oct |
| **Bright** | ✅ | Procedural | White noise with a gentle high shelf; slight low cut |
| **Dark** | ✅ | Procedural | Brown/red noise (leaky-integrated white), −6 dB/oct, high-passed at ~20 Hz to remove DC |
| **Rain** | ✅ | Procedural | Band-limited pink "bed" plus a Poisson stream of droplets (short noise bursts with randomized band-pass filtering, amplitude, and stereo pan). The *intensity* setting controls droplet rate. |
| **Ocean** | ✅ | Procedural | Brown noise → low-pass whose cutoff and gain follow a slow, randomized wave envelope (6–12 s period, jittered), plus a hiss layer on each wave crest; slight L/R decorrelation |
| **Stream** | ✅ | Procedural | Band-passed noise bed plus many short resonant "bubbles" (sine chirps rising quickly to 500–2,000 Hz, Poisson-timed) |
| **Fire** | ✅ | Procedural | Low brown-noise rumble, plus crackles (Poisson impulses → high-pass), plus occasional pops (decaying resonant clicks) |
| **Wind** | ✅ Phase 2 | Procedural | Noise → resonant band-pass with a slowly wandering center frequency and Q; gusts from a smoothed random envelope; whistle on strong gusts |
| **Night** | ✅ Phase 2 | Procedural | Still air bed and distant insect chorus, plus up to six crickets (4–5 kHz sine pulse trains) |
| **Fan** | ✅ Phase 2 | Procedural | Low-passed airflow pulsing at the blade-pass rate, plus a quiet hum |
| **Steam** | ✅ Phase 2 | Procedural | Soft, surging pink hiss over a faint pipe rumble |
| **Grey** | ✅ Phase 2 | Procedural | Pink noise reshaped towards an inverse equal-loudness curve (ISO 226), softened. Often preferred for tinnitus. |
| **Airplane** | ✅ (planned as Phase 3) | Procedural | Cabin roar, ventilation hiss and a slowly beating engine drone; turned out convincing without recordings |
| **Train** | ✅ (planned as Phase 3) | Procedural | Carriage rumble and sway plus wheel clacks at rail joints (two bogies, speed-dependent) |
| Babble | Deferred | Sample | Needs a real crowd recording (CC0), unintelligible, long crossfaded loop |
| Boat / Bus | Deferred | Sample or hybrid | Recording, or procedural rumble plus a sample layer |

Exact recipes for everything built: [`spec/sounds/README.md`](../spec/sounds/README.md).

### 3.2 Sound specs are language-neutral

Each sound is defined in `spec/sounds/<id>.md` and `spec/sounds/<id>.json`:
- the signal graph (generators, filters, envelopes) and their default parameters
- the user-facing parameters (for example, `intensity` and `tilt`), with their ranges
- a **loudness target**: every sound is normalized to the same integrated loudness (−22 LUFS
  at 100% app volume, before the master gain) so switching sounds never causes a jump
- **golden tests**: given a fixed PRNG seed and sample rate, the first N seconds of output must
  match a stored long-term spectrum (1/3-octave bands) and RMS within a tolerance

As built, the recipes live in one table in [`spec/sounds/README.md`](../spec/sounds/README.md)
rather than one file per sound, with golden data in `spec/sounds/golden/<id>.json`.

The golden files guard the sound against unintended changes, and would let any future port
prove it sounds the same.

> With no native app planned, the shared Rust/C++ DSP core idea is moot. WebAssembly remains an
> option for the web app alone if JavaScript performance ever becomes a problem on a phone
> (see docs/investigations/2026-10-playback-gaps.md, step 5).
>
> The Android store listing wraps the PWA as a **Trusted Web Activity** (Bubblewrap, in
> `android/`), so it shares all of the web app's code.

## 4. PWA architecture

### 4.1 Stack
- **Vite + TypeScript**, with **Preact** for the UI (small bundle, familiar API)
- **vite-plugin-pwa** (Workbox) to precache everything for offline use; web app manifest
- **AudioWorklet** for all DSP (runs off the main thread, so no glitches when the UI is busy)
- **Vitest** for DSP unit and golden tests (run headless on `OfflineAudioContext` and on pure
  DSP functions); **Playwright** (Chromium only) for end-to-end tests and accessibility checks
  with axe-core
- CI with GitHub Actions

**Private hosting.** A service worker (needed for offline use and installation) only works over
HTTPS, so the app can't just be opened as a local file. Options, best first:
1. **Cloudflare Pages + Cloudflare Access** (free tier): a static site behind a login only you
   can pass. Once installed, the app runs fully offline, so it only needs to be reached for
   updates.
2. **Tailscale `serve`** from a home machine: a private HTTPS URL that only your devices can reach.
3. GitHub Pages: simplest, but the site is public (Pages on a private repo still publishes
   publicly unless you're on an Enterprise plan). This is acceptable only if the app contains
   nothing licensed (no copied GPL code, only CC0 or original assets), since a public URL counts
   as distribution.

### 4.2 Audio graph

```
AudioWorkletNode("generator", {sound, params, seed, tone})
     inside: sound → tone/warmth shelves (±6 dB) → loudness trim → soft clip (≤ −1 dBFS)
        │
   GainNode  "crossfade"    (per voice, equal-power when switching sounds)
        │
   GainNode  "master"       (user volume; all changes via setTargetAtTime ramps;
        │                    fade-in, sleep-timer fade-out, cross-fade between sounds)
   DynamicsCompressor       (last-resort limiter at −0.5 dBFS; a single sound never reaches it.
                             Tone used to sit after the soft clip, so its boosts hit this
                             limiter at high volume and its clamping was heard as popping)
        │
   ctx.destination
   + a looping, inaudible <audio> file (8 Hz at −54 dBFS, 10 s)   ← media controls + background
                                                                    playback (see below)
```

**Media controls (revised after testing on Android):** the first version sent the Web Audio
output through `MediaStreamAudioDestinationNode` into an `<audio>` element. Neither Chrome
nor Firefox on Android showed media controls for it. Chrome documents that it only shows them
for media elements playing media longer than 5 s, and none for Web Audio. Now Web Audio goes
straight to `ctx.destination`, and a separate `<audio>` element loops a generated 10 s WAV
that is inaudible but not digitally silent (Firefox skips silent media). A "Mix with other
audio" mode leaves it out, for playing alongside other apps without controls.

Key rules:
- **Every gain change is ramped** (≥ 50 ms for UI changes, 2–5 s for start, 30–120 s for the
  sleep fade). Clicks and jumps are an accessibility bug.
- **Switching sounds** cross-fades over about 1.5 s using two generator nodes, then disposes the
  old one.
- The PRNG is a seeded xoshiro128\*\* running inside the worklet (not `Math.random`), so tests are
  deterministic.
- Each worklet generates stereo with decorrelated L/R noise for a wide, comfortable image. A
  **mono** toggle is available for single-sided hearing (respects the user's accessibility needs).

### 4.3 Platform realities (validate these first, in a spike)

| Risk | Mitigation |
|---|---|
| **Autoplay policy**: an `AudioContext` can only start from a user gesture | Start the context from the Play button; show a clear "Tap to play" state after a reload |
| Android Chrome may throttle or kill a background tab | Audible playback through a media element plus an active Media Session normally keeps it alive. Test on your actual phone(s). On Samsung and some other brands, turn off battery optimization for Chrome or the installed PWA. If it still dies overnight, that's the signal to move to the native app sooner. |
| Lock-screen controls | **Media Session API**: title is the sound name, artwork is the sound icon, and play/pause/stop actions are handled |
| The browser can't see or duck for other apps' media | Offer a manual "With media" volume preset (quick-select chip) |
| **Dropouts (pops, gaps) when a phone's CPU is busy or slow** | Allocation-free DSP, warm-up at load (docs/investigations/2026-10-playback-gaps.md), and **always a large output buffer**: `latencyHint: 0.3` instead of the browser's `'playback'` size. Under a limited processing budget this took dropouts from 4–13 per 10 s to none. **Decision (2026-10-13): this is the only behaviour, with no smaller-buffer option.** Cost: sound starts, and volume/tone changes are heard, about 0.3–0.4 s later (measured on Linux; Android may differ), which is acceptable for background sound. Don't reintroduce a low-latency mode without re-measuring dropouts on a phone. |
| Timers drift when the page is throttled | The sleep timer uses audio-clock scheduling (`gain.setTargetAtTime` at `ctx.currentTime + remaining`), not `setTimeout`. It is scheduled when armed and re-synced on `visibilitychange`. |

### 4.4 UI

One main screen, with three panels (native `<dialog>`: bottom sheets on phones, centred on
larger screens). On wide screens the now-playing card sits beside the sound library.

- **Now playing:** a big Play/Stop button (gently "breathing" while playing, tinted per sound),
  the sound's name and status ("Playing Rain · stops at 11:42 PM"), volume (1% steps, with −/+
  buttons) and the "Media is playing" switch, plus quick buttons: Sleep timer, Adjust, Favorite.
- **Library:** favorites as chips (Edit to remove), then all sounds as tiles grouped into Noise,
  Nature, and Machines & travel. Selecting one cross-fades if already playing.
- **Sleep timer panel:** Off · 15 · 30 · 45 · 60 · 90 min · Custom; when running, time left,
  end time, +15 min and Turn off; fade-out length.
- **Adjust panel:** intensity (where the sound has one) and tone, saved per sound; reset.
- **Settings panel:** fade-in, playback mode, mono, "media is playing" volume; theme
  (system/dark/light); install, version and updates, reset; diagnostics (generator load,
  dropouts where the browser reports them, latency); keyboard shortcuts and about.
- **App behaviour:** an install card when the browser offers installation; "ready to work
  offline" notice; updates download in the background and are offered only while nothing is
  playing (never a surprise reload); media controls with next/previous sound.
- Settings are saved in `localStorage`. There's no account.

Accessibility requirements (these are acceptance criteria, not nice-to-haves):
- WCAG 2.2 AA; zero axe-core violations in CI
- All controls labelled; the sound grid is an ARIA radio group; the slider exposes its value
  text ("Volume 35 percent")
- Touch targets ≥ 48×48 px; works at 200% zoom and in landscape
- Follows `prefers-color-scheme` (dark by default at night is fine), `prefers-reduced-motion`
  (no animated visualizer when reduced motion is set), and `prefers-contrast`
- No flashing content, no sudden sounds, no auto-start without consent
- Keyboard shortcuts: Space (play/stop), arrows (volume), 1–9 (pick sound), [ ] (previous/next
  sound), T (sleep timer)
- Manifest `shortcuts`: "Play Rain", "Play Dark noise", and so on, for one-tap launch from the
  home-screen icon (long press)

### 4.5 Proposed repo layout

```
/docs             PLAN.md, decisions (ADRs)
/spec/sounds      language-neutral sound recipes + golden spectra
/web              PWA (Vite + Preact + TS)
  /src/audio      engine.ts, worklets/*.ts, dsp/*.ts (pure, testable functions)
  /src/ui         components
  /test           vitest (DSP + golden), playwright (e2e + a11y)
```

## 5. Native Android (not planned)

**Decision (2026-10-11): no native app.** The PWA does the job: it installs from Chrome, works
offline, shows media controls, and (pending the overnight check in M0/M4) keeps playing with the
screen off.

For the record, a native app would have added only these, none of which the web allows:

- a **Quick Settings tile** (one-tap toggle, like Apple's Control Center button), a home-screen
  widget and an accessibility-shortcut target;
- automatic **"media is playing"** detection and finer audio-focus control, so it could keep
  playing alongside other apps *and* show media controls;
- **stop when the screen locks**, **schedules** and **wake-up alarms**;
- a foreground service, which is more robust than a browser tab against aggressive battery
  savers on some phones.

Reconsider only if one of those becomes a real need, for example if some phone keeps killing
playback overnight despite Unrestricted battery settings. Wrapping the PWA as a Trusted Web
Activity would not help with any of them.

## 6. Milestones

Status key: ✅ done · 🟡 built, needs checking on a real phone · ⬜ not started · ✖ dropped

| # | Milestone | Scope | Exit criteria |
|---|---|---|---|
| 0 🟡 | **Platform spike** (≈2 days) | Bare page: pink noise worklet + `<audio>` keepalive; Media Session | Plays for 8 h overnight with the screen locked on your Android phone in Chrome; CPU < 3% |
| 1 ✅ | **Engine + 3 noises** | Balanced/Bright/Dark, master gain ramps, limiter, seeded PRNG, golden tests | Spectral slopes within ±1 dB/oct of target; loudness matched within ±1 LU; no clicks on start, stop, or switch |
| 2 🟡 | **Nature sounds** | Rain, Ocean, Stream, Fire, with intensity/tilt parameters | Blind listening test with 5+ people: each is recognized and rated "not irritating after 10 min" |
| 3 🟡 | **MVP UI + PWA** | Main screen + panels, timer, favorites, settings saved, offline, installable, shortcuts, update prompt | Installs from Chrome; zero axe violations (✅ in CI, every panel, both themes); full keyboard and TalkBack walkthrough |
| 4 ⬜ | **In daily use** | Hosting (✅ Cloudflare Worker), CI/CD (✅) | Installed on your phone; used for a week without dropouts or annoyances |
| 5 🟡 | **Phase 2 sounds** | Wind, Night, Fan, Steam, Grey noise (+ Airplane, Train) | Same quality gates as M2 (automated checks ✅; listening test pending) |
| 6 ✖ | ~~**Android app**~~ | Dropped 2026-10-11: the PWA is the app (§5) | — |
| 7 ⬜ | **Sample-based sounds** | Babble (CC0 preferred); crossfaded loops. (Train and Airplane are now procedural.) | No audible seam in blind test |

## 7. Quality gates (CI)

- `tsc --noEmit`, Prettier (ESLint deferred: TypeScript strict mode covers most of it for now)
- DSP golden tests: render 10 s at a fixed seed from the pure DSP functions; compare
  1/3-octave spectrum and loudness; assert every sound peaks at or below −1 dBFS at every
  intensity and both tone extremes (generators end in a soft clipper); assert noise colours,
  stereo decorrelation, no DC, and smooth intensity changes. Start, stop and switch are
  click-free by construction (every gain change is a ramp), but not yet measured in a test.
- Real-time safety: every sound must render without garbage collection (pure noises: none at
  all; others at most a few per 20 s) and in well under 10% of real time
  (`test/dsp/performance.test.ts`).
- Playwright end-to-end tests (Chromium) plus axe-core scans of the main screen and every
  panel, in both themes
- Bundle size budget: under 250 KB gzipped (excluding later sample packs, which are lazy-loaded)

## 8. Privacy & safety

- No analytics, no network access after install.
- Hearing safety still matters for a personal app: the default volume starts at 40% (−16 dB on the squared taper), every start
  fades in, and the limiter caps output.

## 9. Open questions

1. **Shared DSP core** (Rust → WASM + NDK) vs. a per-platform port: decide at the start of
   Phase 2 (§3.2).
2. ~~**Hosting**~~: decided. Deployed as a Cloudflare Worker (static assets) at
   `noise.tactile.software`. It stays public, because the Play app opens it.

## 10. Public distribution and sales

The checklist for distributing the app publicly and selling it on Google Play.

**Licensing and assets**
- **GPL-3.0:** the app is released under GPL-3.0-or-later. Selling it is allowed; the full
  source is public, and anyone may build and share it. Code copied from Noice (also GPL-3.0)
  keeps its copyright notices.
- **Recordings:** CC0 has no obligations. CC-BY requires visible attribution in the app.
  **CC-BY-NC forbids selling** and usually blocks ads too. Freesound licenses are per clip, so
  `CREDITS.md` must be complete before release.
- Fonts, icons, and npm/Gradle dependencies each need a license check, plus an in-app
  open-source notices screen (Android: the OSS Licenses plugin or AboutLibraries).
- **Name and wording:** check "Ben's Noise Generator" for trademark conflicts. Using
  a real person's name is fine if it's yours, or with that person's consent. Don't use Apple's
  "Background Sounds" name or Noice's branding in marketing.

**Stores and payments**
- **Google Play:** one-time developer fee; identity verification; a privacy policy and a Data
  Safety form (even if no data is collected); a yearly target-API update; and a written
  justification for the `mediaPlayback` foreground service.
- **`AccessibilityService`** is restricted on Play. An app that isn't itself an accessibility
  tool is usually rejected for using it. Expect to drop it and rely on the Quick Settings tile.
- **Android developer verification:** Google is rolling out a requirement that apps installed on
  certified devices, sideloaded included, come from a registered developer. Check its current
  status before public release. Personal or limited-distribution exemptions may cover the
  current private use.
- **Selling:** in-app purchases or subscriptions through Play must use Play Billing (with a fee
  of about 15% for small developers). A paid PWA needs your own payment provider (for example,
  Stripe) plus licence checks, which conflicts with "fully offline". Selling also brings VAT/sales
  tax, a refund policy, and possibly registering as a business.
- **F-Droid:** free/open source only, no proprietary dependencies; it fits a GPL release, not a
  paid one.

**Regulatory and liability**
- **Health claims:** marketing it to "treat tinnitus", "cure insomnia", or similar can make it a
  regulated medical device (FDA software-as-a-medical-device in the US, EU MDR, UK MHRA). Use
  wellness language ("relaxing background sound", "helps mask noise") and add a "not a medical
  device" disclaimer.
- **Hearing safety:** keep the limiter, default volume, and a volume warning. These reduce
  product-liability exposure.
- **Privacy law:** with no data collected, GDPR/CCPA obligations are minimal, but a privacy
  policy is still required by stores. Adding analytics or crash reporting changes that (consent,
  data processing agreements).
- **Accessibility law:** the EU European Accessibility Act (applies from June 2025) can cover
  consumer apps sold in the EU. The WCAG 2.2 AA target in §4.4 already lines up with it.

**Operations**
- Support, bug reports, and updates across many Android versions and manufacturers' battery
  restrictions (you currently only need it to work on your own phone).
- Public hosting with uptime, a domain, and a terms-of-use page.
