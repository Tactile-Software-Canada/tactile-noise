# Sound recipes

Language-neutral descriptions of every sound: the reference for changing a recipe, and for
proving any future port sounds the same. The reference implementation is
[`web/src/audio/dsp/`](../../web/src/audio/dsp), with one module per sound in
[`sounds/`](../../web/src/audio/dsp/sounds) and the registry, loudness trims and soft clip in
[`generators.ts`](../../web/src/audio/dsp/generators.ts).

## Shared rules

- **Sample rate:** any; recipes are written in Hz and seconds. Golden data is rendered at 48 kHz.
- **PRNG:** xoshiro128\*\* seeded through splitmix32 (`rng.ts`). Each channel and each
  sub-source forks its own stream, so left and right are decorrelated.
- **Processing:** audio is rendered in chunks of 32 samples. Slow parameters (envelopes,
  filter cut-offs, event rates, intensity smoothing) update once per chunk; every stage then
  processes the chunk in place. Nothing allocates while rendering (a test enforces it).
- **Extra controls:** a few sounds have more sliders than intensity and tone (see their
  recipes). Each is 0–1 (UI shows 0–100%), applied to events as they start or smoothed, and
  its default reproduces the recipe, loudness trim and golden data exactly.
- **Intensity:** 0–1 (UI shows 0–100%), default 0.5, smoothed with a 0.5 s time constant.
  "i" below.
- **Loudness:** each sound is multiplied by a trim so it measures **−22 LUFS** (BS.1770,
  ungated) at default intensity (tone neutral).
- **Output stage (every sound):** tone/warmth (low shelf 250 Hz at −6t dB and high shelf
  3 kHz at +6t dB, t = −1 … 1, gliding at most 0.01 per 128-sample block) → trim → soft clip
  (transparent below −4 dBFS, bending as tanh towards a ceiling of −1 dBFS).
- **Noise:** _pink_ = Paul Kellet's refined filter on white; _brown_ = white → 1-pole LP 5 Hz
  → 2-pole HP 25 Hz.
- **wander T:** a random value in [0, 1] that glides to a new random target roughly every
  T seconds (jittered 0.5–1.5 T, smoothing time constant T/2).
- **Events** (drops, bubbles, crackles, clacks) are voices from a fixed pool:
  - Timing: Poisson, by drawing exponential gaps between events (sample-accurate offsets),
    unless a recipe says otherwise.
  - _burst_: noise → band-pass (centre, Q), linear attack, exponential decay (decay time = time
    to fall 60 dB), constant-power pan. The noise is read from a 65,536-sample white-noise
    table at a random offset per voice.
  - _chirp_: sine starting at a frequency and gliding exponentially by a ratio over the decay.
- Ranges written "a–b" are log-uniform for frequencies, amplitudes and decay times, and
  uniform otherwise (pan, Q, periods), except where the code says otherwise.

## Noise

**Balanced:** pink noise.

**Bright:** white noise → 1-pole LP 9 kHz → 1-pole HP 120 Hz.

**Dark:** brown noise.

**Grey:** pink noise → low shelf +8 dB at 160 Hz → peaking −5 dB at 3.5 kHz (Q 1) → high
shelf +5 dB at 8 kHz → LP 15 kHz → HP 30 Hz. A softened inverse equal-loudness (ISO 226)
shape: more bass, a dip where the ear is most sensitive.

## Nature

**Rain**

- Bed: pink → HP 500 Hz → LP 10 kHz, gain (0.5 + 0.8·i)·(0.85 + 0.3·wander 3 s); plus
  brown → 1-pole LP 300 Hz × 0.15.
- Drops at 40 + 900·i^1.5 per second. 85%: burst 1.5–8 kHz, Q 1.5–5, amp 0.15–1.5, decay
  8–40 ms, attack 0.5 ms. 15%: chirp 1.2–4 kHz, glide ×1.3, amp 0.02–0.12, decay 20–60 ms.
  Pan ±0.9.

**Ocean**

- Wave envelope e = 1 − (1 − big)(1 − 0.5·small). Each wave train's phase p rises as
  (p/0.4)^2.5, then decays as (exp(−5(p − 0.4)) − e^−3)/(1 − e^−3), which reaches exactly 0 at the
  end of the wave so the next one starts from silence; big waves last 7–12 s, small ones 4–7 s, with
  amplitude 0.55–1, at speed 0.8 + 0.4·i. The right channel hears e 0.35 s later.
- Per channel, with depth d = 0.6 + 0.4·i: surf = (0.75·brown + 0.25·pink) → two 1-pole LPs
  at 200 + 2800·e^1.5·d Hz, gain 0.25 + 0.75·e·d. Foam = pink → HP 1.8 kHz × 0.35·e³·d.
  Rumble = brown → 1-pole LP 150 Hz × 0.3. Surf and foam gains ramp linearly
  across each 32-sample chunk (no steps, so no clicks). The channel output then goes through two
  2-pole HPs at 55 Hz (removes sub-bass surges that phone speakers distort on).

**Stream**

- Bed: pink → HP 300 Hz → LP 3.5 kHz, gain (0.7 + 0.3·wander 0.25 s)·(0.7 + 0.5·i).
- Bubbles at 80 + 300·i per second: chirp 350–1600 Hz, glide ×1.15–1.6, amp 0.03–0.25,
  attack 2 ms, decay 15–70 ms, pan ±0.8.
- Gurgles at 15 + 40·i per second: burst 200–800 Hz, Q 8, amp 0.2–1, attack 5 ms, decay
  40–120 ms, pan ±0.8.

**Wind**

- Gust g = min(1, 0.75·wander 3.5 s + 0.35·wander 0.9 s), shared by both channels; strength
  s = 0.5 + 0.6·i.
- Per channel: body = pink → band-pass at 220 + 900·(0.3·wander 4 s + 0.7·g)·s Hz, Q 1.2 + 2g,
  gain 0.3 + 0.9·g·s. Whistle = the same pink → band-pass 650 + 900·wander 6 s Hz, Q 14,
  gain 0.35·g³·i. Rumble = brown → 1-pole LP 120 Hz × (0.2 + 0.5g)·s.

**Night**

- Air (per channel): pink → two 1-pole LPs 600 Hz × 0.35, plus a distant insect chorus: the
  same pink → band-pass 6.5 kHz, Q 1.2, × (0.02 + 0.03·wander 5 s)·(0.5 + i).
- Crickets: 6, of which 1 + 5·i are singing (each fades in and out with a 1.5 s time
  constant). Each has a carrier at 3.8–5.2 kHz (uniform), a pulse rate of 25–45 per second
  and a 45% duty cycle, with a sin² envelope per pulse. A chirp is 3–7 pulses, repeated
  every 0.4–1.3 s (redrawn every chirp). Amp 0.05–0.2, fixed pan ±0.9.

**Fire**

- Bed (per channel): (brown → two 1-pole LPs 180 Hz × 1.2 + pink → HP 1.5 kHz → LP 7 kHz ×
  0.08) × flame, where flame = 0.6 + 0.4·wander 0.7 s.
- Crackles at 4 + 30·i per second: 1–6 bursts within 60 ms, 2–9 kHz, Q 0.7, amp 0.04–0.45,
  decay 2–12 ms, pan ±0.8 (±0.1 per click).
- Pops at 0.2 + 0.8·i per second: burst 250–900 Hz, Q 3–8, amp 0.2–0.6, decay 30–80 ms,
  plus a 4 kHz click (Q 0.7, amp 0.35, decay 4 ms). Pan ±0.7.

## Machines and travel

**Fan**

- Blade-pass frequency f = (42 + 36·i)·(0.99 + 0.02·wander 2 s) Hz (3 blades at 14–26 rev/s).
- Air (per channel): pink → two 1-pole LPs 1.8 kHz, plus the same pink → band-pass 320 Hz,
  Q 1.5 × 0.6, all × (0.6 + 0.6·i); then amplitude-modulated by 1 + 0.08·sin(2πft).
- Hum: 0.05·sin(2πft) + 0.025·sin(4πft). The right channel's hum is 90° later.

**Steam**

- Per channel: pink → HP 1.2 kHz → LP 8 kHz × surge·(0.85 + 0.15·wander 0.4 s), plus brown
  → 1-pole LP 200 Hz × 0.12.
- surge = (1 − d + d·wander 4 s)·(0.6 + 0.6·i), with d = 0.15 + 0.35·i.

**Airplane**

- Per channel: (0.7·brown + 0.3·pink) → two 1-pole LPs at 320 + 600·i Hz, plus pink →
  1-pole HP 900 Hz × 0.035, all × (0.9 + 0.2·wander 8 s).
- Engine drone: (sin + 0.4·sin 2×) at 88 Hz (left) and 88.35 Hz (right), so they beat
  slowly, × (0.02 + 0.02·i) × engine volume.
- Extra control **engine volume** (0–1, default 0.5) scales the drone only, never the roar or
  hiss: gain 0 at 0, 1 at 0.5, 4 at 1 (squared curve below 0.5, linear above), smoothed with a
  50 ms time constant.

**Train**

- Bed (per channel): brown → two 1-pole LPs 180 Hz × 1.4 + pink → band-pass 500 Hz, Q 0.7
  × 0.25·(0.8 + 0.4·wander 2 s)·(0.7 + 0.6·i).
- Speed v = 16 + 18·i m/s. Rail joints every 25 m (×0.97–1.03, uniform). At each joint,
  axles at 0, 2.5, 17 and 19.5 m (two bogies) cross it at those distances ÷ v. Each axle:
  burst 120–220 Hz, Q 1.5, amp 0.5–0.9 (rear bogie ×0.8), attack 2 ms, decay 80–130 ms, plus
  a click: burst 1.5–3 kHz, Q 1, amp ×0.18, decay 15 ms. Pan −0.15 (front bogie) /
  +0.15 (rear). All axle amplitudes are multiplied by the bump volume gain.
- Extra control **bump randomness** r (0–1, default 0): the rail gap is multiplied by a uniform
  draw from 1 ± j, with j = 0.03 + 0.67·r, so the mean rhythm is unchanged but r = 1 gives gaps
  of 0.3–1.7 × the nominal one.
- Extra control **bump volume** (0–1, default 0.5): gain 0 at 0 (no bumps at all), 1 at 0.5,
  6 at 1 (squared curve below 0.5, linear above).

## Golden data

[`golden/`](golden) holds, per sound, the integrated loudness and third-octave spectral density
of the first 10 s of the left channel (seed 12345, 48 kHz, intensity 0.5). Any port must match
within ±1.5 dB per band and ±0.5 LU. Regenerate after an intentional change with
`npm run test:golden:update` in `web/`.
