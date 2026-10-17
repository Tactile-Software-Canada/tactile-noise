import workletUrl from './worklet.ts?worker&url'
import type { SoundId } from './soundIds'
import { createKeepaliveElement } from './keepalive'
import { volumeToGain } from './levels'
import {
  PROCESSOR_NAME,
  type ProcessorMessage,
  type ProcessorOptions,
  type StatsMessage,
} from './messages'

/**
 * Owns the Web Audio graph:
 *
 *   generator(s) [incl. tone/warmth + soft clip, in the worklet] → crossfade gains → bus
 *     → master (volume) → fade (start/stop) → timer (sleep fade) → mono
 *     → limiter → ctx.destination
 *
 * Output "media" (default) also plays a looping, inaudible <audio> element
 * (see keepalive.ts). That is what makes browsers show media controls in the
 * notification shade, on the lock screen and for headset buttons, and treat
 * the page as playing media. The cost: the browser takes audio focus, so
 * starting music in another app may pause us. Output "direct" skips the element,
 * so it mixes with other apps' audio but has no media controls.
 *
 * Every gain change is ramped; nothing ever jumps.
 */

/** "media": with media controls (default). "direct": no controls, mixes with other audio. */
export type OutputMode = 'media' | 'direct'

/**
 * Output buffer: always large (decision 2026-10-13, docs/PLAN.md §4.3).
 *
 * Asking for ~0.3 s of buffering, instead of the browser's 'playback' size,
 * rides out CPU hiccups on slow phones: under a limited processing budget it
 * took dropouts from 4–13 per 10 s to none. The cost is latency: sound starts,
 * and volume/tone changes are heard, roughly 0.3–0.4 s later. For a
 * background-sound app that is a good trade, so there is deliberately no
 * smaller-buffer option. Don't add one back without re-measuring on a phone.
 */
const LATENCY_HINT = 0.3
export type Status = 'stopped' | 'starting' | 'playing' | 'stopping'

export interface EngineState {
  status: Status
  sound: SoundId | null
  /** Wall-clock time (ms) when the sleep timer ends, or null. */
  timerEndsAt: number | null
}

export interface PlayOptions {
  sound: SoundId
  intensity: number
  /** 0–100 slider value. */
  volume: number
  /** −100 … 100 slider value. */
  tilt: number
  /** Values (0–100) of the sound's extra controls, by id. */
  extras?: Record<string, number>
  mono: boolean
  fadeInSeconds: number
  output: OutputMode
}

/** Settings → Diagnostics. Fields are null when unknown or unsupported. */
export interface Diagnostics {
  contextState: string
  sampleRate: number | null
  /** Output latency as reported by the browser, in ms. */
  latencyMs: number | null
  /** Share of real time the sound generator needs (0–1), over the last second. */
  load: number | null
  maxBlockMs: number | null
  /** Audio dropouts since Play was pressed (Chrome only, when exposed). */
  dropouts: { events: number; ms: number } | null
}

const CROSSFADE_SECONDS = 1.5
const STOP_FADE_SECONDS = 0.8
const RAMP = 0.05

interface Voice {
  node: AudioWorkletNode
  gain: GainNode
  sound: SoundId
}

interface Graph {
  ctx: AudioContext
  bus: GainNode
  master: GainNode
  fade: GainNode
  timer: GainNode
  mono: GainNode
  limiter: DynamicsCompressorNode
  analyser: AnalyserNode
  ready: Promise<void>
}

export class AudioEngine {
  private graph: Graph | null = null
  private voice: Voice | null = null
  private output: OutputMode = 'media'
  private readonly audioEl: HTMLAudioElement
  private state: EngineState = { status: 'stopped', sound: null, timerEndsAt: null }
  private readonly listeners = new Set<(s: EngineState) => void>()
  private stopTimeout: ReturnType<typeof setTimeout> | undefined
  private sleepTimeout: ReturnType<typeof setTimeout> | undefined
  private playToken = 0
  private diagnostics = false
  /** Current tone (−1 … 1), passed to each new generator. */
  private tone = 0
  private lastStats: StatsMessage | null = null
  private dropoutBaseline: { events: number; ms: number } | null = null

  constructor() {
    useMediaPlaybackAudioSession()
    this.audioEl = createKeepaliveElement()
    // If the system pauses our media element (a phone call, another app
    // taking audio focus), stop too, so the controls and the sound agree.
    this.audioEl.addEventListener('pause', () => {
      if (this.output === 'media' && this.state.status === 'playing') void this.stop(0)
    })
    document.addEventListener('visibilitychange', () => this.checkSleepTimer())
  }

  getState(): EngineState {
    return this.state
  }

  subscribe(fn: (s: EngineState) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** The <audio> element behind the media controls (exposed for tests). */
  get mediaElement(): HTMLAudioElement {
    return this.audioEl
  }

  /**
   * Creates the (suspended) AudioContext and loads the worklet at page load,
   * so its warm-up runs before Play is pressed. Browsers allow this without a
   * user gesture; the context only starts making sound in {@link play}.
   */
  prepare(): void {
    const g = this.ensureGraph()
    g.ready
      .then(() => {
        if (g.ctx.state === 'running' && this.state.status === 'stopped') return g.ctx.suspend()
      })
      .catch(() => {
        // Reported when Play is pressed.
      })
  }

  /**
   * Starts playback. Must be called from a user gesture (click/key): the
   * AudioContext and the media element are both started synchronously here.
   */
  async play(opts: PlayOptions): Promise<void> {
    const token = ++this.playToken
    clearTimeout(this.stopTimeout)
    const g = this.ensureGraph()
    const resumed = g.ctx.resume()
    this.output = opts.output
    const mediaStarted = this.output === 'media' ? this.audioEl.play() : Promise.resolve()
    this.update({ status: 'starting', sound: opts.sound })

    try {
      await Promise.all([g.ready, resumed])
      await mediaStarted.catch((err: unknown) => {
        // The sound still plays; only the media controls are missing.
        console.warn('Media controls unavailable: <audio> did not start', err)
      })
    } catch (err) {
      if (token === this.playToken) this.update({ status: 'stopped' })
      throw err
    }
    if (token !== this.playToken) return

    this.dropoutBaseline = readDropouts(g.ctx)
    const now = g.ctx.currentTime
    this.setVolume(opts.volume)
    this.setTilt(opts.tilt)
    this.setMono(opts.mono)
    if (!this.voice || this.voice.sound !== opts.sound) {
      this.replaceVoice(opts.sound, opts.intensity, opts.extras, false)
    } else {
      this.setIntensity(opts.intensity)
      for (const [id, value] of Object.entries(opts.extras ?? {})) this.setExtra(id, value)
    }
    // Fade in from wherever we are (silence, or part-way through a stop).
    const fade = g.fade.gain
    const from = Math.max(fade.value, 0.0001)
    fade.cancelScheduledValues(now)
    fade.setValueAtTime(from, now)
    fade.exponentialRampToValueAtTime(1, now + Math.max(0.05, opts.fadeInSeconds))
    this.update({ status: 'playing', sound: opts.sound })
  }

  /** Fades out, then suspends the AudioContext to save battery. */
  async stop(fadeSeconds = STOP_FADE_SECONDS): Promise<void> {
    const g = this.graph
    this.playToken++
    this.cancelSleepTimer()
    if (!g || this.state.status === 'stopped') {
      this.update({ status: 'stopped' })
      return
    }
    this.update({ status: 'stopping' })
    const now = g.ctx.currentTime
    holdAt(g.fade.gain, now)
    g.fade.gain.setTargetAtTime(0, now, Math.max(0.01, fadeSeconds / 4))
    const token = this.playToken
    await new Promise<void>((resolve) => {
      this.stopTimeout = setTimeout(resolve, fadeSeconds * 1000 + 50)
    })
    if (token !== this.playToken) return
    this.disposeVoice()
    this.audioEl.pause()
    await g.ctx.suspend().catch(() => {})
    if (token === this.playToken) this.update({ status: 'stopped' })
  }

  /** Switches sound, cross-fading when already playing. */
  setSound(sound: SoundId, intensity: number, extras?: Record<string, number>): void {
    if (!this.graph || this.state.status !== 'playing') return
    if (this.voice?.sound === sound) return
    this.replaceVoice(sound, intensity, extras, true)
    this.update({ sound })
  }

  setIntensity(value: number): void {
    const msg: ProcessorMessage = { type: 'intensity', value }
    this.voice?.node.port.postMessage(msg)
  }

  /** One of the sound's extra controls (0–100 slider value; see `extras` in sounds.ts). */
  setExtra(id: string, percent: number): void {
    const msg: ProcessorMessage = { type: 'param', id, value: percent / 100 }
    this.voice?.node.port.postMessage(msg)
  }

  setVolume(percent: number): void {
    const g = this.graph
    if (!g) return
    ramp(g.master.gain, volumeToGain(percent), g.ctx.currentTime)
  }

  /**
   * Tone/warmth (−100 … 100). Applied inside the generator, before its soft
   * clip, so boosted peaks are rounded off rather than hitting the limiter.
   */
  setTilt(tilt: number): void {
    this.tone = Math.max(-1, Math.min(1, tilt / 100))
    const msg: ProcessorMessage = { type: 'tone', value: this.tone }
    this.voice?.node.port.postMessage(msg)
  }

  /** Downmixes to mono (e.g. for single-sided hearing): both ears get L+R. */
  setMono(mono: boolean): void {
    const g = this.graph
    if (!g) return
    g.mono.channelCount = mono ? 1 : 2
    g.mono.channelCountMode = mono ? 'explicit' : 'max'
  }

  setOutput(mode: OutputMode): void {
    this.output = mode
    if (mode === 'media' && this.state.status === 'playing') {
      void this.audioEl.play().catch(() => {})
    } else if (mode === 'direct') {
      this.audioEl.pause()
    }
  }

  /**
   * Sleep timer: scheduled on the audio clock so it still fades on time if
   * the page is throttled in the background. The fade takes the last
   * `fadeSeconds` of the timer (or all of it, if shorter).
   */
  startSleepTimer(seconds: number, fadeSeconds: number): void {
    const g = this.graph
    if (!g || this.state.status !== 'playing') return
    this.cancelSleepTimer()
    const now = g.ctx.currentTime
    const fade = Math.min(fadeSeconds, seconds)
    const t = g.timer.gain
    t.setValueAtTime(1, now)
    t.setValueAtTime(1, now + seconds - fade)
    t.exponentialRampToValueAtTime(0.0001, now + seconds)
    this.update({ timerEndsAt: Date.now() + seconds * 1000 })
    this.sleepTimeout = setTimeout(() => this.checkSleepTimer(), seconds * 1000 + 100)
  }

  /** Adds `seconds` to a running sleep timer (it restarts its fade if needed). */
  extendSleepTimer(seconds: number, fadeSeconds: number): void {
    const ends = this.state.timerEndsAt
    if (ends === null) return
    const remaining = Math.max(0, (ends - Date.now()) / 1000)
    this.startSleepTimer(remaining + seconds, fadeSeconds)
  }

  cancelSleepTimer(): void {
    clearTimeout(this.sleepTimeout)
    const g = this.graph
    if (g) {
      const now = g.ctx.currentTime
      holdAt(g.timer.gain, now)
      // Come back gently if we were part-way through the fade.
      g.timer.gain.setTargetAtTime(1, now, 0.3)
    }
    if (this.state.timerEndsAt !== null) this.update({ timerEndsAt: null })
  }

  /** Turns on render-load reporting from the worklet (costs a little CPU). */
  setDiagnostics(on: boolean): void {
    this.diagnostics = on
    if (!on) this.lastStats = null
    const msg: ProcessorMessage = { type: 'stats', enabled: on }
    this.voice?.node.port.postMessage(msg)
  }

  getDiagnostics(): Diagnostics {
    const g = this.graph
    const playing = this.state.status === 'playing'
    const dropouts = g && playing ? readDropouts(g.ctx) : null
    const base = this.dropoutBaseline
    const latency = g ? g.ctx.outputLatency || g.ctx.baseLatency : 0
    return {
      contextState: g?.ctx.state ?? 'not created',
      sampleRate: g?.ctx.sampleRate ?? null,
      latencyMs: latency ? Math.round(latency * 1000) : null,
      load: playing ? (this.lastStats?.load ?? null) : null,
      maxBlockMs: playing ? (this.lastStats?.maxBlockMs ?? null) : null,
      dropouts:
        dropouts && base
          ? { events: dropouts.events - base.events, ms: Math.round(dropouts.ms - base.ms) }
          : dropouts,
    }
  }

  /** RMS level (dBFS) of the output, for tests and diagnostics. */
  measureDb(): number {
    const g = this.graph
    if (!g) return -Infinity
    const buf = new Float32Array(g.analyser.fftSize)
    g.analyser.getFloatTimeDomainData(buf)
    const ms = buf.reduce((a, b) => a + b * b, 0) / buf.length
    return 10 * Math.log10(ms)
  }

  private checkSleepTimer(): void {
    const ends = this.state.timerEndsAt
    if (ends !== null && Date.now() >= ends) void this.stop(0.05)
  }

  private ensureGraph(): Graph {
    if (this.graph) return this.graph
    const ctx = new AudioContext({ latencyHint: LATENCY_HINT })
    const gain = (value: number) => new GainNode(ctx, { gain: value })
    const g: Graph = {
      ctx,
      bus: gain(1),
      master: gain(0),
      fade: gain(0),
      timer: gain(1),
      mono: gain(1),
      // Last-resort safety only (e.g. two voices overlapping in a crossfade).
      // Generators already soft-clip; a hard, fast limiter here used to clamp
      // audibly whenever the tone boost pushed peaks into it.
      limiter: new DynamicsCompressorNode(ctx, {
        threshold: -0.5,
        knee: 1,
        ratio: 12,
        attack: 0.003,
        release: 0.25,
      }),
      analyser: new AnalyserNode(ctx, { fftSize: 2048 }),
      ready: ctx.audioWorklet.addModule(workletUrl),
    }
    g.bus.connect(g.master).connect(g.fade)
    g.fade.connect(g.timer).connect(g.mono).connect(g.limiter)
    g.limiter.connect(ctx.destination)
    g.limiter.connect(g.analyser)
    this.graph = g
    return g
  }

  private replaceVoice(
    sound: SoundId,
    intensity: number,
    extras: Record<string, number> | undefined,
    crossfade: boolean,
  ): void {
    const g = this.graph!
    const params: Record<string, number> = {}
    for (const [id, percent] of Object.entries(extras ?? {})) params[id] = percent / 100
    const options: ProcessorOptions = {
      sound,
      intensity,
      params,
      seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
      tone: this.tone,
      stats: this.diagnostics,
    }
    const node = new AudioWorkletNode(g.ctx, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: options,
    })
    node.port.onmessage = (event: MessageEvent<StatsMessage>) => {
      if (event.data.type === 'stats' && this.voice?.node === node) this.lastStats = event.data
    }
    const gain = new GainNode(g.ctx, { gain: crossfade ? 0 : 1 })
    node.connect(gain).connect(g.bus)
    const old = this.voice
    this.voice = { node, gain, sound }
    if (!old) return
    if (!crossfade) {
      disposeVoice(old)
      return
    }
    const now = g.ctx.currentTime
    const steps = 64
    const fadeIn = new Float32Array(steps)
    const fadeOut = new Float32Array(steps)
    for (let i = 0; i < steps; i++) {
      // Equal-power curves keep the loudness steady through the crossfade.
      const x = i / (steps - 1)
      fadeIn[i] = Math.sin((x * Math.PI) / 2)
      fadeOut[i] = Math.cos((x * Math.PI) / 2)
    }
    curveTo(gain.gain, fadeIn, now, CROSSFADE_SECONDS)
    const from = old.gain.gain.value
    curveTo(
      old.gain.gain,
      fadeOut.map((v) => v * from),
      now,
      CROSSFADE_SECONDS,
    )
    setTimeout(() => disposeVoice(old), CROSSFADE_SECONDS * 1000 + 200)
  }

  private disposeVoice(): void {
    if (this.voice) disposeVoice(this.voice)
    this.voice = null
  }

  private update(patch: Partial<EngineState>): void {
    this.state = { ...this.state, ...patch }
    for (const fn of this.listeners) fn(this.state)
  }
}

/**
 * iOS/WebKit-only quirk. On iOS, WebKit (which every iOS browser uses) mutes
 * Web Audio when the iPhone's silent switch is on, unless the page declares
 * its audio as media playback. `navigator.audioSession` only exists in
 * WebKit (Safari 16.4+ / iOS 17+); Chrome, Firefox and other Android or
 * desktop browsers don't have it, so this does nothing there. iOS isn't a
 * target platform; this is a harmless one-liner, not iOS support.
 */
function useMediaPlaybackAudioSession(): void {
  const nav = navigator as Navigator & { audioSession?: { type: string } }
  try {
    if (nav.audioSession) nav.audioSession.type = 'playback'
  } catch {
    // Unsupported value or API; nothing to do.
  }
}

/**
 * Cumulative output dropouts, where the browser exposes them: Chrome's
 * experimental `playoutStats` (fallback frames, ms) or the newer
 * `playbackStats` (underruns). Null elsewhere.
 */
function readDropouts(ctx: AudioContext): { events: number; ms: number } | null {
  const c = ctx as AudioContext & {
    playoutStats?: { fallbackFramesEvents?: number; fallbackFramesDuration?: number }
    playbackStats?: { underrunEvents?: number; underrunDuration?: number }
  }
  try {
    const p = c.playbackStats
    if (p && typeof p.underrunEvents === 'number') {
      return { events: p.underrunEvents, ms: (p.underrunDuration ?? 0) * 1000 }
    }
    const o = c.playoutStats
    if (o && typeof o.fallbackFramesEvents === 'number') {
      return { events: o.fallbackFramesEvents, ms: o.fallbackFramesDuration ?? 0 }
    }
  } catch {
    // Not available.
  }
  return null
}

function disposeVoice(v: Voice): void {
  const msg: ProcessorMessage = { type: 'dispose' }
  v.node.port.postMessage(msg)
  v.node.disconnect()
  v.gain.disconnect()
}

/** Follows `curve` from `now`; falls back to a smooth glide if automation overlaps. */
function curveTo(param: AudioParam, curve: Float32Array, now: number, seconds: number): void {
  param.cancelScheduledValues(now)
  try {
    param.setValueCurveAtTime(curve, now, seconds)
  } catch {
    param.setTargetAtTime(curve[curve.length - 1] ?? 0, now, seconds / 4)
  }
}

/** Short smooth glide to `value`; used for every interactive control. */
function ramp(param: AudioParam, value: number, now: number): void {
  holdAt(param, now)
  param.setTargetAtTime(value, now, RAMP / 3)
}

/** Cancels pending automation while keeping the current value (no jump). */
function holdAt(param: AudioParam, now: number): void {
  const current = param.value
  param.cancelScheduledValues(now)
  param.setValueAtTime(current, now)
}
