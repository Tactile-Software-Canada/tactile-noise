# Ben's Noise Generator

`ben-gen` for short. An app that plays continuous ambient sound (balanced/bright/dark noise, rain, ocean, stream, fire, and more) to
help with focus, sensory overload, tinnitus masking, and sleep. It works like the built-in
_Background Sounds_ feature in iOS and macOS.

It's an installable, fully offline **Progressive Web App (PWA)**, live at
https://noise.tactile.software, and it's sold on **Google Play** as *Tactile Noise*. The Play
app is a Trusted Web Activity: a thin Android shell that opens the same site full-screen in
Chrome. All app code lives in the PWA, so a web deploy updates both.

See [`docs/PLAN.md`](docs/PLAN.md) for the product and technical plan.

## Layout

```
app.config.json   name, colours, host, package ID, version, signing fingerprints:
                  the one copy, read by both targets
web/              the PWA (Preact, Vite, Web Audio); tests; Cloudflare deploy. See web/README.md
android/          the Play Store app (Bubblewrap TWA) and its listing. See android/README.md
spec/sounds/      sound recipes and golden test data
docs/             plan and investigations
```

Icons are drawn once, in `web/public/icons/icon.svg` and `maskable.svg`. `npm run icons` (in
`web/`) renders every PNG the PWA, the Android app and the Play listing need.

## Status

The PWA is in [`web/`](web): fourteen generated sounds (noise: Balanced, Bright, Dark, Grey;
nature: Rain, Ocean, Stream, Wind, Night, Fire; machines and travel: Fan, Steam, Airplane,
Train), volume and "media is playing" volume, sleep timer with fade-out, favorites, per-sound
tone and intensity, media controls, themes, offline install with update prompts, and
diagnostics. See [`web/README.md`](web/README.md) to run and deploy it. Sound recipes are in
[`spec/sounds`](spec/sounds).

The Android package (`software.tactile.noise`) is in [`android/`](android), published as an
upfront paid app. See [`android/README.md`](android/README.md) to build, sign and release it.

## CI

`.github/workflows/ci.yml` runs on every push and pull request. It runs the PWA's format
check, type check, unit and end-to-end tests and build, and checks that the Android project
builds and that `android/twa-manifest.json` matches `app.config.json`. It doesn't deploy,
sign or upload anything.

iOS is not targeted.

## Forks

No signing keys or deploy credentials are included. To publish your own build, change
`name`, `host` and `android.packageId` in `app.config.json`, create your own upload key
(see [`android/README.md`](android/README.md)), and replace `android.sha256CertFingerprints`
with its fingerprint.

## License

[GPL-3.0-or-later](LICENSE). The Android shell files generated from Google's Bubblewrap
template (`android/app/src/main/AndroidManifest.xml` and the Java sources) keep their original
Apache-2.0 headers.
