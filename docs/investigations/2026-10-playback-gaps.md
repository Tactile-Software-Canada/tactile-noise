# Investigation: gaps in playback on first launch

**Report (2026-10-11):** on the first visit to the deployed PWA (Android phone), playback skipped or
had an audible gap roughly every 3 seconds, then cleared up on its own.

**Status:** steps 1–4 of the fix plan are implemented (see "Result" below). Needs
confirming on the phone, using Settings → Diagnostics.

## Result (fix implemented)

- **Step 1 (allocation-free, block-based DSP):** done. Each stage processes 32-sample chunks in
  place; voices live in typed arrays and read a shared noise table; events use exponential
  gaps instead of a per-sample random check. With the code optimized, garbage collections
  per 20 s of audio went from 30 (Balanced) and 158 (Rain) to 0 and about 4. Allocation went
  from 1.5 and 8.3 MB/s to about 0 and 0.25 MB/s. Steady-state CPU is about 3× lower
  (Rain 2.5% → 0.8% of real time), and unoptimized cost is 2.5–4× lower (Rain 40–56% →
  16–21%). The sounds still matched their previous golden spectra and loudness before the
  golden files were regenerated. `test/dsp/performance.test.ts` now enforces this for every
  sound.
- **Step 2 (warm-up):** done. The AudioContext and worklet load at page load, and the worklet
  renders 0.1 s of every sound as it loads (about 60 ms on the test server), so the first
  second's worst block went from 2 ms to about 0.4 ms there.
- **Step 3:** unchanged and kept (`latencyHint: 'playback'`, fade-in).
- **Step 4 (diagnostics):** done. Settings → Diagnostics → Audio engine shows generator load,
  the slowest block, output latency, and dropouts since Play where the browser reports them.
- **Step 5 (WebAssembly):** not needed unless the phone still shows dropouts.

## Summary

The sound generators run in an AudioWorklet, in JavaScript, on an audio thread with a hard
deadline: 128 samples every 2.7 ms. Two properties of the current DSP code make that deadline
easy to miss on a phone, especially right after launch:

1. **Unoptimized code is roughly 15–40× slower.** V8 (Chrome's JavaScript engine) first runs new
   code unoptimized and only optimizes it after it has been running for a while. On the first
   launch nothing is optimized yet, and the phone is also busy loading the page and installing
   the service worker.
2. **The DSP allocates memory constantly.** Every small DSP function that returns a decimal
   number (`rng.bipolar()`, `noise.next()`, `filter.process()`) can force V8 to box the result
   as a new heap object. The code makes several such calls per sample, so it produces garbage
   continuously. Garbage collection pauses the audio thread: hundreds of times a second before
   optimization, and still every few hundred milliseconds afterwards.

Together these fit the report: regular dropouts on a cold start (garbage collection pausing an
audio thread that is already running behind), fading once V8 has optimized the hot code. Chrome's
own guidance on profiling Web Audio says the same: garbage collection blocks the worklet thread,
and the fix is to allocate up front and reuse memory
([web.dev: Profiling Web Audio apps in Chrome](https://web.dev/articles/profiling-web-audio-apps-in-chrome)).

This is unlikely to be first-visit-only. Each cold launch starts unoptimized again, but later
launches have less competing work (the service worker is already installed), so the glitches
may be shorter or not noticeable.

## Measurements

Measured in Node 22 (the same V8 as Chrome) on the bundled DSP code, on a fast 4-core x86
server. A phone's power-efficient cores are several times slower, so these figures are
optimistic.

**CPU cost per second of audio, as % of real time** (first second → steady state):

| Sound    | Normal (optimizing) | Unoptimized only (`--max-opt=0`) |
| -------- | ------------------- | -------------------------------- |
| Balanced | 1.8% → 0.2%         | 7–11%                            |
| Ocean    | 2.5% → 0.8%         | 17–20%                           |
| Fire     | 3.8% → 1.0%         | 23–27%                           |
| Rain     | 4.1% → 2.5%         | 38–56%, worst single block 43 ms |

Rain unoptimized uses about half of real time even on this server; on a phone it would go over
budget until V8 optimizes it. The 43 ms worst-case block (16× the 2.7 ms deadline) is a
garbage-collection pause.

**Garbage collections (young generation) while rendering:**

| Condition                         | Balanced   | Rain         |
| --------------------------------- | ---------- | ------------ |
| Unoptimized, 6 s of audio         | 426 (71/s) | 2359 (393/s) |
| Optimized ("warm"), 20 s of audio | 30 (1.5/s) | 158 (8/s)    |
| Target                            | 0          | 0            |

**Allocation rate when warm**, from the V8 sampling heap profiler (including objects that were
already collected): Balanced ≈ 1.5 MB/s, Ocean ≈ 5 MB/s, Stream ≈ 4.7 MB/s, Fire ≈ 5.6 MB/s,
Rain ≈ 8.3 MB/s. It is attributed to `Rng.bipolar`, `PinkNoise.next`, `BrownNoise.next`,
`VoicePool.process` (`for…of`), the generators' per-sample `sample()` methods (array
destructuring), and the `createGenerator` wrapper. None of these should allocate at all.

### What was ruled out or couldn't be reproduced here

- **Output route (MediaStream → `<audio>` vs. direct):** _(Update: the MediaStream route has since been removed; see the media-controls fix in `docs/PLAN.md` §4.2. All audio now goes straight to `ctx.destination`.)_ no difference in any test. Not ruled out
  on a real phone, because the `<audio>` element has its own buffer that Chrome's stats don't
  cover, so the diagnostics below show both routes so they can be compared on a phone.
- **Reproducing in headless Chromium:** I used Chrome's experimental
  `AudioContext.playoutStats` (counts dropouts, called "fallback frames"), which I checked
  with a deliberately overloaded worklet (about 57 dropouts per second). The app had **zero**
  dropouts, even with the browser pinned to one core shared with 12 busy loops; Chrome's audio
  thread seems to get priority over them. Making the worklet do 32× its normal work produced
  one 23 ms dropout during the cold start, then none. Headless Chrome's fake audio output
  doesn't behave like a phone's audio thread, so confirming the fix needs the real phone (see
  step 4).
- **Something in the sounds every 3 s:** Rain's bed level drifts on a ~3 s random cycle, but by
  at most ±1.3 dB, with no gaps. Ocean deliberately dips between waves (every 4–12 s); if the
  report was about Ocean, part of it may be by design.

## Fix plan

Ordered by impact; steps 1–2 address the root cause.

### 1. Make the DSP allocation-free and block-based (main fix)

Rewrite the hot path so that nothing is allocated after a generator is constructed, and so
there are few function calls per sample:

- Noise sources fill a `Float32Array` per block (`pink.fill(buf)`) instead of returning one
  sample per call; filters process a buffer in place (`biquad.processBlock(buf)`). Inside each
  loop, state lives in local variables and is written back to the object at the end of the
  block, which keeps decimal numbers unboxed.
- Generators allocate their scratch buffers in the constructor and mix them with plain indexed
  loops. In hot code: no array destructuring, `for…of`, `forEach`, closures or object literals.
- `VoicePool`: indexed loops over parallel typed arrays instead of `Voice` objects and
  `find()`.
- The soft clip and trim stay in the same block loop.

The sound must not change: the existing golden spectra and loudness tests (`spec/sounds/golden`)
check that. (The random sequence will change if the order in which random numbers are drawn
changes; if so, regenerate the golden files and confirm the spectra and loudness stay within
tolerance of the old ones before accepting.)

**New regression tests:**

- _Allocation-free:_ render 20 s of warm audio per sound in Vitest with a `gc` performance
  observer; assert at most 1 collection, against today's 30–158.
- _CPU budget:_ warm render cost per sound under a generous ceiling (for example under 10% of
  real time on the CI runner), so a slow change gets caught without the test being flaky.

Expected effect: unoptimized cost drops several-fold, because there are far fewer calls and
boxed values per sample, and garbage-collection pauses go away once the code is optimized.

### 2. Warm up before the user presses Play

- Create the `AudioContext` (suspended) and load the worklet module when the page loads, not on
  the first tap. Chrome allows a suspended context without a user gesture.
- When the worklet module loads, render about 0.5 s of every sound into a scratch buffer and
  throw it away. That runs the hot loops enough for V8 to optimize them on the audio thread
  before any audible block. It costs a fraction of a second, once, while nothing is playing.

### 3. Keep the safety margins

Keep `latencyHint: 'playback'` (the larger buffer) and the start fade-in. Optionally start the
fade-in a little later, about 150 ms, so the first blocks are quiet.

### 4. On-device diagnostics (needed to confirm the fix on the phone)

Add an **Advanced → Diagnostics** line showing dropouts since Play from
`AudioContext.playoutStats` where the browser supports it ("Dropouts: 0 (0 ms)"), and the
output route. That makes it possible to compare before and after, and the Media and Direct
routes, on the actual phone, which the server can't do.

### 5. If it's still not clean: move the DSP to WebAssembly

If dropouts remain after steps 1–2 on the phone, compile the DSP to WebAssembly (Rust or
AssemblyScript). That removes both JIT warm-up and garbage collection, and it is the "shared
DSP core" once considered for an Android app (`docs/PLAN.md` §3.2; that app is no longer planned). It's a bigger change, so
only if needed.

## How to reproduce the measurements

The scripts used are throwaway; step 1 turns the important ones into tests. Method:

- Bundle `web/src/audio/dsp/generators.ts` with esbuild and render it block by block in Node,
  timing each second, with and without `--max-opt=0`.
- Count garbage collections with `--trace-gc`, or with a `PerformanceObserver` on `gc` entries.
- Find allocation sites with `HeapProfiler.startSampling` and
  `includeObjectsCollectedByMinorGC: true` (through `node:inspector`).
- Read browser dropouts from `audioContext.playoutStats.fallbackFramesEvents` with Chromium's
  `--enable-experimental-web-platform-features` flag.

## Follow-up (2026-10-13): popping and latency on the phone under a limited budget

**Report:** subtle popping (mostly noticed on Ocean, after its wave-restart clicks and sub-bass
were fixed) and sluggish response on the phone.

**Method.** Chromium played the app into a PulseAudio null sink that was recorded, so dropouts
were measured in the real output (and cross-checked against Chrome's `playoutStats`). The
processing budget was limited by serving a build whose worklet renders every block N times
(emulating an N-times-slower audio thread), and the main thread was slowed with Chrome's CPU
throttling (6× ≈ mid-range phone, 20× ≈ budget phone in power saving).

**Findings**

1. **Dropouts start well before the generator uses 100% of the budget.** Ocean dropped out from
   about 57–65% average load, because single blocks took 4–5× the average (5–7 ms against a
   2.9 ms deadline). Ocean costs about 3× as much as Balanced, so it hits this first.
2. **The spikes were garbage collection, from a TypeScript build setting.** With
   `useDefineForClassFields` (TypeScript's default for this target), a class field declared
   without an initial value is first defined as `undefined`, so V8 stores it as a generic slot
   and every write of a decimal number allocates. `WaveTrain.phase` (Ocean's waves) and the
   `Smoother` used by every sound were hit. Smaller sources: control-rate helpers returning
   numbers, `Biquad` returning a `{cos, sin}` object when retuned, and decimal arguments to
   per-channel methods that V8 doesn't inline. GCs per minute of audio, before → after: Ocean
   5 → 0, Wind 22 → 0, Airplane 8 → 0, Train 6 → 0, Night 11 → 1, Rain 11 → 4, Fire 8 → 3,
   Stream 8 → 3; noise colours, Fan and Steam 0.
3. **A larger output buffer absorbs what's left.** At 110× load, the default buffer (Chrome's
   "playback" size) had 4–13 dropouts per 10 s; asking for 0.3 s (`latencyHint: 0.3`) gave
   none, at the cost of about 0.5 s more latency on that machine.
4. **The UI was heavy for a slow phone.** At 6× CPU slowdown, tapping Play cost 690 ms of
   main-thread time, switching sound 594 ms, a 30-step volume drag 1.8 s, mostly painting:
   the now-playing glow (a large radial gradient) animated its background for 1.2 s on every
   change, buttons and tiles had colour transitions, and every slider step re-rendered the whole
   app and wrote settings to storage. If Android doesn't give the audio worklet real-time
   priority, this UI work also competes with audio on the same cores.

**Changes**

- `useDefineForClassFields: false`; control-rate helpers use `step()` + `.value`; `Biquad`
  retuning writes fields; per-channel parameters are fields set by the parent.
- ~~Settings → Playback → **Large audio buffer** (off by default)~~. **Superseded the same
  day:** the large buffer (`latencyHint: 0.3`) is now always used and the option is removed
  (decision recorded in `docs/PLAN.md` §4.3 and `web/src/audio/engine.ts`).
- UI: the glow is static on its own compositor layer, the breathing rings and playing bars are
  compositor-only (`will-change`), no colour transitions on the button or tiles; the sound grid
  and favorites skip re-rendering unless their inputs change; panel contents render only while
  open; settings are saved 0.4 s after changes settle (and immediately when the page is hidden).
  At 6×: tapping Play 690 → 356 ms, switching sound 594 → 298 ms, long tasks during a drag
  313 → 87 ms.

**If it still pops on the phone** (with the large buffer now always on), the phone is
CPU-starved, and the next step is rendering audio ahead of time in a Worker (the audio thread
then only copies samples), so playback no longer depends on hitting every deadline.

## Follow-up (2026-10-13): peaks adding up ("constructive interference")

**Question:** could some popping come from components adding up into peaks?

**Measured** (60 s per sound, full intensity, volume 100%, Tone at −100/0/+100, and the
left+right sum a mono phone speaker plays):

- **Left/right summing is not it.** The channels are independent, so the mono sum has _lower_
  peaks than either channel.
- **Inside Ocean, the layers did share noise sources** (rumble and surf the same brown noise,
  foam and surf the same pink), so they added in phase at crests. Giving each its own source
  made no difference to the peak-to-loudness ratio (the crest peaks come from the surf
  itself), so that change was not kept.
- **The Tone slider was the real problem.** Its shelves (±6 dB) sat _after_ each sound's soft
  clip, in front of a hard, fast limiter (threshold −3 dBFS, knee 0, ratio 20, 2 ms attack). At
  high volume, a tone boost pushed peaks into the limiter: Ocean warmer at full intensity hit it
  about 150 times a minute, Airplane/Train/Fan warmer several hundred, and Fire brighter
  reached +4.4 dBFS (true clipping). Each abrupt gain clamp sounds like a pop.

**Fix:** tone now runs inside the generator, before the soft clip, and the soft clip's ceiling
is −1 dBFS (it starts bending at −4 dBFS), so a single sound can never reach the output
limiter, which is now a gentle last resort at −0.5 dBFS for crossfade overlaps. Every sound
at both tone extremes and full intensity now peaks at or below −1 dBFS; at most 350 samples
per million are softly rounded (Fire's crackles), instead of being hard-limited. A test
enforces this for all sounds.
