import { useEffect, useRef, useState } from 'preact/hooks'
import type { AudioEngine } from '../audio/engine'
import type { SoundId } from '../audio/soundIds'
import { soundInfo } from '../sounds'
import { Icon } from './Icon'
import { ICONS } from './icons'
import { TactileWaves } from './TactileWaves'

interface Props {
  open: boolean
  onClose(): void
  onComplete(selectedSound?: SoundId): void
  engine: AudioEngine
  currentSound: SoundId
}

const PREVIEW_SOUNDS: SoundId[] = ['balanced', 'rain', 'ocean']

export function OnboardingDialog({ open, onClose, onComplete, engine, currentSound }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const [previewing, setPreviewing] = useState<SoundId | null>(null)

  // Focus and modal management
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      setStep(0)
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  // Reset scroll position on step change so new step always starts at top
  useEffect(() => {
    cardRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [step])

  // Stop preview sound if dialog closes
  useEffect(() => {
    if (!open && previewing) {
      engine.stop()
      setPreviewing(null)
    }
  }, [open, previewing, engine])

  const togglePreview = async (soundId: SoundId) => {
    if (previewing === soundId) {
      await engine.stop()
      setPreviewing(null)
    } else {
      try {
        await engine.play({
          sound: soundId,
          volume: 35,
          intensity: 0.5,
          tilt: 0,
          mono: false,
          fadeInSeconds: 1,
          output: 'media',
        })
        setPreviewing(soundId)
      } catch (err) {
        console.error('Failed to preview sound', err)
      }
    }
  }

  const handleFinish = (keepSound?: SoundId) => {
    const finalSound = keepSound || previewing || currentSound
    onComplete(finalSound)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' && step < 1) {
      setStep((s) => s + 1)
    } else if (e.key === 'ArrowLeft' && step > 0) {
      setStep((s) => s - 1)
    }
  }

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      id="onboarding-dialog"
      class="onboarding-dialog"
      aria-labelledby="onboarding-title"
      onKeyDown={handleKeyDown}
      onClose={onClose}
    >
      <TactileWaves />

      <div class="onboarding-container">
        <header class="onboarding-topbar">
          <div class="onboarding-brand">
            <Icon path={ICONS.logo} size={28} />
            <span class="onboarding-brand-title">Tactile Noise</span>
          </div>
          <button
            type="button"
            class="text-btn onboarding-skip-btn"
            onClick={onClose}
            aria-label="Skip onboarding"
          >
            Skip
          </button>
        </header>

        <div class="onboarding-main">
          <div ref={cardRef} class="onboarding-card" role="region" aria-live="polite">
            {step === 0 && (
              <div class="onboarding-slide" data-slide="1">
                <div class="onboarding-pill">Interactive Preview</div>
                <h2 id="onboarding-title" class="onboarding-headline">
                  Live Generated Soundscapes
                </h2>
                <p class="onboarding-desc">
                  Tap to preview the live generator
                </p>

                <div class="onboarding-sound-grid" role="group" aria-label="Sample sounds">
                  {PREVIEW_SOUNDS.map((id) => {
                    const info = soundInfo(id)
                    const isPlaying = previewing === id
                    return (
                      <button
                        key={id}
                        type="button"
                        class={`onboarding-sound-card ${isPlaying ? 'is-playing' : ''}`}
                        onClick={() => void togglePreview(id)}
                        aria-pressed={isPlaying}
                      >
                        <div class="sound-card-icon" style={`--glow-hue: ${info.hue}`}>
                          <Icon path={info.icon} size={28} />
                        </div>
                        <div class="sound-card-info">
                          <span class="sound-card-name">{info.name}</span>
                          <span class="sound-card-desc">{info.description}</span>
                        </div>
                        <div class="sound-card-state" aria-hidden="true">
                          {isPlaying ? (
                            <span class="sound-wave-bars">
                              <span class="bar bar-1"></span>
                              <span class="bar bar-2"></span>
                              <span class="bar bar-3"></span>
                            </span>
                          ) : (
                            <span class="play-indicator">▶</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
                <p class="onboarding-hint">
                  Tap again to stop. You can customize intensity and tone for every sound in the
                  app.
                </p>
              </div>
            )}

            {step === 1 && (
              <div class="onboarding-slide" data-slide="2">
                <h2 id="onboarding-title" class="onboarding-headline">
                  Crafted for your daily routine
                </h2>

                <div class="onboarding-features-list">
                  <div class="onboarding-feature-item">
                    <div class="onboarding-feature-icon" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        width="20"
                        height="20"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
                      </svg>
                    </div>
                    <div>
                      <strong>Tone & Warmth Control</strong>
                      <p>
                        Adjust brightness or soften high frequencies to match your room and
                        headphones.
                      </p>
                    </div>
                  </div>

                  <div class="onboarding-feature-item">
                    <div class="onboarding-feature-icon" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        width="20"
                        height="20"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                      </svg>
                    </div>
                    <div>
                      <strong>Gentle Sleep Timer</strong>
                      <p>
                        Fades volume down progressively over up to 5 minutes so you never wake with
                        a start.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer class="onboarding-footer">
          <div class="onboarding-dots" role="tablist" aria-label="Onboarding steps">
            {[0, 1].map((i) => (
              <button
                key={i}
                type="button"
                class={`onboarding-dot ${step === i ? 'is-active' : ''}`}
                onClick={() => setStep(i)}
                aria-label={`Step ${i + 1} of 3`}
                aria-selected={step === i}
                role="tab"
              />
            ))}
          </div>

          <div class="onboarding-actions">
            {step > 0 && (
              <button
                type="button"
                class="secondary onboarding-back-btn"
                onClick={() => setStep((s) => s - 1)}
              >
                Back
              </button>
            )}

            {step === 0 ? (
              <button
                type="button"
                class="primary onboarding-next-btn"
                onClick={() => setStep((s) => s + 1)}
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                class="primary onboarding-finish-btn"
                onClick={() => handleFinish()}
              >
                Start
              </button>
            )}
          </div>
        </footer>
      </div>
    </dialog>
  )
}
