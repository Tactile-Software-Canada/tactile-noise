/// <reference path="./worklet-globals.d.ts" />
import { SOUND_IDS, createGenerator, isSoundId, type Generator } from './dsp/generators'
import {
  PROCESSOR_NAME,
  type ProcessorMessage,
  type ProcessorOptions,
  type StatsMessage,
} from './messages'

/**
 * Warm-up: render a little of every sound while the module loads (at page
 * load, before Play is pressed), so V8 has compiled and optimised the hot DSP
 * loops before the first audible block. Without it, the first seconds run
 * unoptimised and are the most likely to miss the audio deadline.
 * (docs/investigations/2026-10-playback-gaps.md)
 */
const WARM_UP_SECONDS = 0.1
{
  const l = new Float32Array(128)
  const r = new Float32Array(128)
  const blocks = Math.ceil((WARM_UP_SECONDS * sampleRate) / 128)
  for (const id of SOUND_IDS) {
    const gen = createGenerator(id, sampleRate, 1)
    for (let b = 0; b < blocks; b++) gen.render(l, r)
  }
}

/** Runs one sound generator on the audio thread. One node per playing sound. */
class GeneratorProcessor extends AudioWorkletProcessor {
  private readonly generator: Generator
  private alive = true
  private stats: boolean
  private busyMs = 0
  private maxMs = 0
  private blocks = 0

  constructor(options: AudioWorkletNodeOptions) {
    super(options)
    const opts = options.processorOptions as ProcessorOptions
    const sound = isSoundId(opts.sound) ? opts.sound : 'balanced'
    this.generator = createGenerator(
      sound,
      sampleRate,
      opts.seed,
      opts.intensity,
      opts.tone,
      opts.params,
    )
    this.stats = opts.stats === true
    this.port.onmessage = (event: MessageEvent<ProcessorMessage>) => {
      const msg = event.data
      if (msg.type === 'intensity') this.generator.setIntensity(msg.value)
      else if (msg.type === 'param') this.generator.setParam(msg.id, msg.value)
      else if (msg.type === 'tone') this.generator.setTone?.(msg.value)
      else if (msg.type === 'stats') this.stats = msg.enabled
      else if (msg.type === 'dispose') this.alive = false
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0]
    const left = out?.[0]
    if (!left) return this.alive
    const right = out[1] ?? new Float32Array(left.length)
    if (!this.stats) {
      this.generator.render(left, right)
      return this.alive
    }
    // Date.now() has 1 ms resolution, but summed over many blocks the
    // quantisation averages out, giving an unbiased estimate of render time.
    const t0 = Date.now()
    this.generator.render(left, right)
    const ms = Date.now() - t0
    this.busyMs += ms
    if (ms > this.maxMs) this.maxMs = ms
    this.blocks += left.length
    if (this.blocks >= sampleRate) {
      const msg: StatsMessage = {
        type: 'stats',
        load: this.busyMs / ((this.blocks / sampleRate) * 1000),
        maxBlockMs: this.maxMs,
      }
      this.port.postMessage(msg)
      this.busyMs = 0
      this.maxMs = 0
      this.blocks = 0
    }
    return this.alive
  }
}

registerProcessor(PROCESSOR_NAME, GeneratorProcessor)
