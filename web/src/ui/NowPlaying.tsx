import type { SoundInfo } from '../sounds'
import { Slider } from './controls'
import { Icon } from './Icon'
import { ICONS } from './icons'

interface Props {
  sound: SoundInfo
  playing: boolean
  statusText: string
  volume: number
  withMedia: boolean
  timerLabel: string
  timerActive: boolean
  canSaveFavorite: boolean
  isFavorite: boolean
  onToggle(): void
  onVolume(v: number): void
  onOpenTimer(): void
  onOpenAdjust(): void
  onSaveFavorite(): void
}

export function NowPlaying(p: Props) {
  return (
    <section class="now" aria-labelledby="now-name" style={{ '--hue': p.sound.hue }}>
      <div class="now-glow" aria-hidden="true" />
      <button type="button" class="play" onClick={p.onToggle} data-testid="play">
        <span class="play-halos" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <Icon path={p.playing ? ICONS.stop : ICONS.play} filled size={44} />
        <span class="play-label">
          {p.playing ? 'Stop' : 'Play'}
          <span class="visually-hidden"> {p.sound.name}</span>
        </span>
      </button>

      <div class="now-title">
        <h2 id="now-name">
          <Icon path={p.sound.icon} size={22} />
          {p.sound.name}
        </h2>
        <p class="now-desc">{p.sound.description}</p>
      </div>

      <p class="status" role="status" aria-live="polite" data-testid="status">
        {p.statusText}
      </p>

      <div class="now-controls">
        <Slider
          id="volume"
          label={p.withMedia ? 'Volume with media' : 'Volume'}
          min={0}
          max={100}
          value={p.volume}
          valueText={`${p.volume} percent`}
          display={`${p.volume}%`}
          stepButtons
          onInput={p.onVolume}
        />
      </div>

      <div class="quick-actions">
        <button
          type="button"
          class={`pill${p.timerActive ? ' active' : ''}`}
          onClick={p.onOpenTimer}
          aria-haspopup="dialog"
          data-testid="open-timer"
        >
          <Icon path={ICONS.timer} size={20} />
          <span>Sleep timer</span>
          <span class="pill-value">{p.timerLabel}</span>
        </button>
        <button
          type="button"
          class="pill"
          onClick={p.onOpenAdjust}
          aria-haspopup="dialog"
          data-testid="open-adjust"
        >
          <Icon path={ICONS.tune} size={20} />
          <span>Adjust</span>
        </button>
        <button
          type="button"
          class={`pill${p.isFavorite ? ' active' : ''}`}
          onClick={p.onSaveFavorite}
          disabled={!p.canSaveFavorite && !p.isFavorite}
          aria-pressed={p.isFavorite}
          data-testid="favorite"
        >
          <Icon path={ICONS.star} size={20} filled={p.isFavorite} />
          <span>Favorite</span>
        </button>
      </div>
    </section>
  )
}
