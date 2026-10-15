import { useEffect, useRef, useState } from 'preact/hooks'
import { clamp, formatClock, formatRemaining } from '../audio/levels'
import { TIMER_FADE_OPTIONS, TIMER_PRESETS } from '../settings'
import { ChipGroup, Select } from './controls'
import { Icon } from './Icon'
import { ICONS } from './icons'
import { Sheet } from './Sheet'

interface Props {
  open: boolean
  onClose(): void
  minutes: number
  fadeSeconds: number
  /** Wall-clock end of the running timer, or null. */
  endsAt: number | null
  playing: boolean
  onMinutes(m: number): void
  onFade(s: number): void
  onExtend(minutes: number): void
}

const CUSTOM_STORAGE_KEY = 'ben-gen:custom-timer-minutes'

function loadStoredCustomMinutes(): number {
  try {
    const v = Number(localStorage.getItem(CUSTOM_STORAGE_KEY))
    if (Number.isFinite(v) && v >= 1 && v <= 1440) return Math.round(v)
  } catch {
    // ignore
  }
  return 120
}

export function formatFade(seconds: number): string {
  return seconds < 60 ? `${seconds} seconds` : `${seconds / 60} minute${seconds === 60 ? '' : 's'}`
}

export function TimerSheet(p: Props) {
  const [isCustomMode, setIsCustomMode] = useState<boolean>(
    () => !TIMER_PRESETS.includes(p.minutes) && p.minutes > 0,
  )

  const [customMinutes, setCustomMinutes] = useState<number>(() => {
    if (!TIMER_PRESETS.includes(p.minutes) && p.minutes > 0) return p.minutes
    return loadStoredCustomMinutes()
  })

  const [draftMinutes, setDraftMinutes] = useState<string>(() => String(customMinutes))
  const isInputFocused = useRef(false)

  // Sync state when dialog opens or active minutes change from outside
  useEffect(() => {
    if (p.open) {
      if (!TIMER_PRESETS.includes(p.minutes) && p.minutes > 0) {
        setIsCustomMode(true)
        setCustomMinutes(p.minutes)
        if (!isInputFocused.current) setDraftMinutes(String(p.minutes))
      } else if (p.minutes === 0) {
        setIsCustomMode(false)
      }
    }
  }, [p.open, p.minutes])

  const saveCustomMinutes = (mins: number) => {
    setCustomMinutes(mins)
    try {
      localStorage.setItem(CUSTOM_STORAGE_KEY, String(mins))
    } catch {
      // ignore
    }
  }

  const applyCustomMinutes = (mins: number) => {
    const valid = clamp(Math.round(mins), 1, 1440)
    saveCustomMinutes(valid)
    setDraftMinutes(String(valid))
    p.onMinutes(valid)
  }

  const stepMinutes = (delta: number) => {
    applyCustomMinutes(customMinutes + delta)
  }

  const handleInput = (raw: string) => {
    setDraftMinutes(raw)
    const val = Math.round(Number(raw))
    if (Number.isFinite(val) && val >= 1 && val <= 1440) {
      saveCustomMinutes(val)
      p.onMinutes(val)
    }
  }

  const handleCommit = (raw: string) => {
    isInputFocused.current = false
    const val = Math.round(Number(raw))
    if (Number.isFinite(val) && val >= 1 && val <= 1440) {
      applyCustomMinutes(val)
    } else {
      setDraftMinutes(String(customMinutes))
    }
  }

  const remaining = p.endsAt !== null ? p.endsAt - Date.now() : null
  const effectiveMinutes = isCustomMode ? customMinutes : p.minutes
  const targetEndMs =
    p.playing && p.endsAt !== null ? p.endsAt : Date.now() + effectiveMinutes * 60 * 1000

  return (
    <Sheet id="timer-sheet" title="Sleep timer" open={p.open} onClose={p.onClose}>
      {remaining !== null && p.endsAt !== null ? (
        <div class="timer-status">
          <p class="timer-big">
            <span>{formatRemaining(remaining)}</span> left
          </p>
          <p class="hint">Stops at {formatClock(p.endsAt)}</p>
          <div class="button-row">
            <button type="button" class="secondary" onClick={() => p.onExtend(15)}>
              <Icon path={ICONS.plus} size={18} />
              15 min
            </button>
            <button
              type="button"
              class="secondary"
              onClick={() => {
                setIsCustomMode(false)
                p.onMinutes(0)
              }}
            >
              Turn off
            </button>
          </div>
        </div>
      ) : (
        <p class="hint timer-intro">
          {p.minutes === 0
            ? 'Choose how long to play before fading out and stopping.'
            : p.playing
              ? 'The timer starts now.'
              : `Starts when you press Play: ${effectiveMinutes} min.`}
        </p>
      )}

      <ChipGroup
        name="timer"
        legend="Stop after"
        value={isCustomMode ? -1 : p.minutes}
        options={[
          ...TIMER_PRESETS.map((m): [number, string] => [m, m === 0 ? 'Off' : `${m} min`]),
          [-1, 'Custom'],
        ]}
        onChange={(m) => {
          if (m === -1) {
            setIsCustomMode(true)
            applyCustomMinutes(customMinutes)
          } else {
            setIsCustomMode(false)
            p.onMinutes(m)
          }
        }}
      >
        {isCustomMode && (
          <div class="custom-timer-card">
            <div class="custom-card-header">
              <span class="custom-card-title">
                <Icon path={ICONS.timer} size={18} />
                <span>Custom duration</span>
              </span>
              <span class="custom-card-badge">{formatRemaining(customMinutes * 60 * 1000)}</span>
            </div>

            <p class="custom-card-summary" aria-live="polite">
              {p.playing ? (
                <>
                  Stops at <strong>{formatClock(targetEndMs)}</strong>
                </>
              ) : (
                <>
                  Will run for <strong>{formatRemaining(customMinutes * 60 * 1000)}</strong> once
                  started (stops ~{formatClock(targetEndMs)})
                </>
              )}
            </p>

            <div class="custom-stepper-wrap">
              <button
                type="button"
                class="stepper-btn"
                aria-label="Decrease by 5 minutes"
                title="Decrease by 5 minutes"
                disabled={customMinutes <= 1}
                onClick={() => stepMinutes(-5)}
              >
                <Icon path={ICONS.minus} size={20} />
              </button>

              <div class="custom-input-box">
                <label for="custom-timer" class="custom-input-label">
                  Minutes
                </label>
                <div class="custom-input-field">
                  <input
                    id="custom-timer"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={1440}
                    class="custom-timer-input"
                    value={draftMinutes}
                    onFocus={() => {
                      isInputFocused.current = true
                    }}
                    onInput={(e) => handleInput(e.currentTarget.value)}
                    onChange={(e) => handleCommit(e.currentTarget.value)}
                    onBlur={(e) => handleCommit(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur()
                      }
                    }}
                  />
                  <span class="custom-unit-tag" aria-hidden="true">
                    min
                  </span>
                </div>
              </div>

              <button
                type="button"
                class="stepper-btn"
                aria-label="Increase by 5 minutes"
                title="Increase by 5 minutes"
                disabled={customMinutes >= 1440}
                onClick={() => stepMinutes(5)}
              >
                <Icon path={ICONS.plus} size={20} />
              </button>
            </div>

            <div class="custom-quick-row" role="group" aria-label="Quick adjustments">
              <button
                type="button"
                class="quick-chip"
                aria-label="Subtract 15 minutes"
                onClick={() => stepMinutes(-15)}
                disabled={customMinutes <= 15}
              >
                −15m
              </button>
              <button
                type="button"
                class="quick-chip"
                aria-label="Add 15 minutes"
                onClick={() => stepMinutes(15)}
                disabled={customMinutes >= 1425}
              >
                +15m
              </button>
              <button
                type="button"
                class="quick-chip"
                aria-label="Add 1 hour"
                onClick={() => stepMinutes(60)}
                disabled={customMinutes >= 1380}
              >
                +1h
              </button>
              <button
                type="button"
                class={`quick-chip preset-chip ${customMinutes === 120 ? 'active' : ''}`}
                aria-label="Set to 2 hours"
                onClick={() => applyCustomMinutes(120)}
              >
                2h
              </button>
              <button
                type="button"
                class={`quick-chip preset-chip ${customMinutes === 480 ? 'active' : ''}`}
                aria-label="Set to 8 hours"
                onClick={() => applyCustomMinutes(480)}
              >
                8h (Night)
              </button>
            </div>
          </div>
        )}
      </ChipGroup>

      <Select
        id="timer-fade"
        label="Fade out over"
        hint="The sound fades gently over the end of the timer."
        value={p.fadeSeconds}
        options={TIMER_FADE_OPTIONS.map((s) => [s, formatFade(s)])}
        onChange={p.onFade}
      />
      <p class="hint">The timer stays set: it starts again each time you press Play.</p>
    </Sheet>
  )
}
