import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type { AudioEngine, EngineState } from '../audio/engine'
import { formatClock, formatRemaining } from '../audio/levels'
import { setupMediaSession, updateMediaSession } from '../audio/mediaSession'
import type { SoundId } from '../audio/soundIds'
import { applyUpdate, getPwaState, promptInstall, subscribePwa, type PwaState } from '../pwa'
import {
  MAX_FAVORITES,
  clearSettings,
  defaultSettings,
  loadSettings,
  newId,
  saveSettings,
  type Favorite,
  type Settings,
  type SoundSettings,
} from '../settings'
import { SOUNDS, adjacentSound, soundInfo } from '../sounds'
import { AdjustSheet } from './AdjustSheet'
import { BrandIcon } from './BrandIcon'
import { Favorites } from './Favorites'
import { Icon } from './Icon'
import { ICONS } from './icons'
import { NowPlaying } from './NowPlaying'
import { OnboardingDialog } from './OnboardingDialog'
import { SettingsSheet } from './SettingsSheet'
import { SoundGrid } from './SoundGrid'
import { TimerSheet } from './TimerSheet'
import { Toast, type ToastMessage } from './Toast'

interface Props {
  engine: AudioEngine
  /** Sound requested by the launch URL (manifest shortcut), if any. */
  initialSound: SoundId | null
  forceOnboarding?: boolean
}

type SheetName = 'timer' | 'adjust' | 'settings'

const THEME_COLORS = { dark: '#0e1218', light: '#f3f0e9' }

export function App({ engine, initialSound, forceOnboarding = false }: Props) {
  const [settings, setSettings] = useState<Settings>(() => {
    const s = loadSettings()
    return initialSound ? { ...s, sound: initialSound } : s
  })
  const [engineState, setEngineState] = useState<EngineState>(engine.getState())
  const [pwa, setPwa] = useState<PwaState>(getPwaState())
  const [sheet, setSheet] = useState<SheetName | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(
    forceOnboarding || !settings.onboardingDismissed,
  )
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, setTick] = useState(0)
  // Latest settings for callbacks that outlive a render (media keys, timers).
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // Save shortly after changes settle (not on every slider step), and right
  // away if the page is hidden or closed.
  useEffect(() => {
    const id = setTimeout(() => saveSettings(settings), 400)
    return () => clearTimeout(id)
  }, [settings])
  useEffect(() => {
    const flush = () => saveSettings(settingsRef.current)
    const onHide = () => document.visibilityState === 'hidden' && flush()
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])
  useEffect(() => engine.subscribe(setEngineState), [engine])
  useEffect(() => subscribePwa(setPwa), [])

  const playing = engineState.status === 'playing' || engineState.status === 'starting'
  const sound = soundInfo(settings.sound)
  const per = settings.perSound[settings.sound]
  const volume = settings.withMedia ? settings.mediaVolume : settings.volume

  // Updates the ref synchronously too, so an action right after an update
  // (playing a favorite) sees the new settings.
  const update = useCallback((patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch }
    settingsRef.current = next
    setSettings(next)
  }, [])

  const notify = useCallback((text: string, action?: ToastMessage['action']) => {
    setToast({ id: Date.now(), text, action })
  }, [])

  // ---- playback -----------------------------------------------------------

  const play = useCallback(async () => {
    const s = settingsRef.current
    const p = s.perSound[s.sound]
    setError(null)
    try {
      await engine.play({
        sound: s.sound,
        intensity: p.intensity / 100,
        volume: s.withMedia ? s.mediaVolume : s.volume,
        tilt: p.tilt,
        mono: s.mono,
        fadeInSeconds: s.fadeInSeconds,
        output: s.output,
      })
      if (s.timerMinutes > 0 && engine.getState().timerEndsAt === null) {
        engine.startSleepTimer(s.timerMinutes * 60, s.timerFadeSeconds)
      }
    } catch (err) {
      console.error(err)
      setError('Sound could not start. Try again, or change Playback mode in Settings.')
    }
  }, [engine])

  const stop = useCallback(() => void engine.stop(), [engine])
  const toggle = useCallback(() => (playing ? stop() : void play()), [playing, play, stop])

  const selectSound = useCallback(
    (id: SoundId) => {
      update({ sound: id })
      const p = settingsRef.current.perSound[id]
      engine.setSound(id, p.intensity / 100)
      engine.setTilt(p.tilt)
    },
    [engine, update],
  )

  const stepSound = useCallback(
    (step: 1 | -1) => selectSound(adjacentSound(settingsRef.current.sound, step)),
    [selectSound],
  )

  const dismissOnboarding = useCallback(
    (selectedSound?: SoundId) => {
      update({ onboardingDismissed: true })
      setShowOnboarding(false)
      if (selectedSound && selectedSound !== settingsRef.current.sound) {
        selectSound(selectedSound)
      }
    },
    [selectSound, update],
  )

  const setVolume = (v: number) => {
    update(settings.withMedia ? { mediaVolume: v } : { volume: v })
    engine.setVolume(v)
  }

  const setWithMedia = (on: boolean) => {
    update({ withMedia: on })
    engine.setVolume(on ? settings.mediaVolume : settings.volume)
  }

  const setPerSound = (patch: Partial<SoundSettings>) => {
    update({ perSound: { ...settings.perSound, [settings.sound]: { ...per, ...patch } } })
    if (patch.intensity !== undefined) engine.setIntensity(patch.intensity / 100)
    if (patch.tilt !== undefined) engine.setTilt(patch.tilt)
  }

  // ---- sleep timer --------------------------------------------------------

  const setTimer = (minutes: number) => {
    update({ timerMinutes: minutes })
    if (minutes === 0) engine.cancelSleepTimer()
    else if (playing) engine.startSleepTimer(minutes * 60, settings.timerFadeSeconds)
  }

  const setTimerFade = (seconds: number) => {
    update({ timerFadeSeconds: seconds })
    const ends = engineState.timerEndsAt
    if (ends !== null) engine.startSleepTimer(Math.max(1, (ends - Date.now()) / 1000), seconds)
  }

  // Countdown refresh while the sleep timer runs.
  useEffect(() => {
    if (engineState.timerEndsAt === null) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [engineState.timerEndsAt])

  // ---- favorites ----------------------------------------------------------

  const current: Omit<Favorite, 'id'> = { sound: settings.sound, volume, ...per }
  const currentFavorite =
    settings.favorites.find(
      (f) =>
        f.sound === current.sound &&
        f.volume === current.volume &&
        f.intensity === current.intensity &&
        f.tilt === current.tilt,
    ) ?? null

  const toggleFavorite = () => {
    if (currentFavorite) {
      update({ favorites: settings.favorites.filter((f) => f.id !== currentFavorite.id) })
      notify('Removed from favorites')
    } else if (settings.favorites.length < MAX_FAVORITES) {
      update({ favorites: [...settings.favorites, { id: newId(), ...current }] })
      notify('Saved to favorites')
    }
  }

  // Stable callbacks (read state from refs) so the memoised Favorites list
  // doesn't re-render on every slider step.
  const playingRef = useRef(false)
  playingRef.current = playing
  const playFavorite = useCallback(
    (f: Favorite) => {
      update({
        sound: f.sound,
        withMedia: false,
        volume: f.volume,
        perSound: {
          ...settingsRef.current.perSound,
          [f.sound]: { intensity: f.intensity, tilt: f.tilt },
        },
      })
      if (playingRef.current) {
        engine.setSound(f.sound, f.intensity / 100)
        engine.setIntensity(f.intensity / 100)
        engine.setTilt(f.tilt)
        engine.setVolume(f.volume)
      } else {
        void play()
      }
    },
    [engine, play, update],
  )

  const removeFavorite = useCallback(
    (id: string) => update({ favorites: settingsRef.current.favorites.filter((f) => f.id !== id) }),
    [update],
  )

  // ---- settings -----------------------------------------------------------

  const resetSettings = () => {
    clearSettings()
    const d = defaultSettings()
    settingsRef.current = d
    setSettings(d)
    engine.setVolume(d.volume)
    engine.setTilt(0)
    engine.setMono(d.mono)
    engine.setOutput(d.output)
    engine.cancelSleepTimer()
    if (playing) engine.setSound(d.sound, 0.5)
    notify('Settings reset')
  }

  // Theme: "system" follows the device; otherwise force it.
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      const scheme = m.media.includes('light') ? 'light' : 'dark'
      m.content = THEME_COLORS[settings.theme === 'system' ? scheme : settings.theme]
    })
  }, [settings.theme])

  // ---- media session --------------------------------------------------------

  useEffect(() => {
    setupMediaSession({
      play: () => void play(),
      pause: stop,
      stop,
      next: () => stepSound(1),
      previous: () => stepSound(-1),
    })
  }, [play, stop, stepSound])

  useEffect(() => {
    updateMediaSession(engineState.sound ? soundInfo(engineState.sound).name : null, playing)
  }, [engineState.sound, playing])

  // ---- install & updates ----------------------------------------------------

  const offlineAnnounced = useRef(false)
  useEffect(() => {
    if (pwa.offlineReady && !offlineAnnounced.current) {
      offlineAnnounced.current = true
      notify('Ready to work offline')
    }
  }, [pwa.offlineReady, notify])

  // Offer the update only while nothing is playing, so it never cuts off sound.
  useEffect(() => {
    if (pwa.updateReady && !playing) {
      notify('A new version is ready', { label: 'Restart', run: applyUpdate })
    }
  }, [pwa.updateReady, playing, notify])

  // Plain notices dismiss themselves; ones with an action stay until used.
  useEffect(() => {
    if (!toast || toast.action) return
    const id = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(id)
  }, [toast])

  // ---- keyboard -------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (document.querySelector('dialog[open]')) return
      const t = e.target as HTMLElement
      if (t.closest('input, select, textarea, button, summary, [contenteditable]')) return
      if (e.key === ' ') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault()
        setVolume(Math.min(100, volume + (e.shiftKey ? 1 : 5)))
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault()
        setVolume(Math.max(0, volume - (e.shiftKey ? 1 : 5)))
      } else if (/^[1-9]$/.test(e.key)) {
        const s = SOUNDS[Number(e.key) - 1]
        if (s) selectSound(s.id)
      } else if (e.key === ']') {
        stepSound(1)
      } else if (e.key === '[') {
        stepSound(-1)
      } else if (e.key === 't' || e.key === 'T') {
        setSheet('timer')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---- render ---------------------------------------------------------------

  const endsAt = engineState.timerEndsAt
  const remaining = endsAt !== null ? endsAt - Date.now() : null
  const playingName = soundInfo(engineState.sound ?? settings.sound).name
  const statusText =
    engineState.status === 'starting'
      ? `Starting ${playingName}…`
      : engineState.status === 'playing'
        ? `Playing ${playingName}` + (endsAt !== null ? ` · stops at ${formatClock(endsAt)}` : '')
        : engineState.status === 'stopping'
          ? 'Stopping…'
          : 'Stopped'
  const timerLabel =
    remaining !== null
      ? formatRemaining(remaining)
      : settings.timerMinutes > 0
        ? `${settings.timerMinutes} min`
        : 'Off'
  const showInstallCard = pwa.canInstall && !pwa.installed && !settings.installDismissed

  return (
    <div class="app" data-status={engineState.status}>
      <header class="topbar">
        <h1 class="brand">
          <BrandIcon size={26} />
          <span>Tactile Noise</span>
        </h1>
        <button
          type="button"
          class="icon-btn"
          aria-label="Settings"
          aria-haspopup="dialog"
          data-testid="open-settings"
          onClick={() => setSheet('settings')}
        >
          <Icon path={ICONS.settings} />
        </button>
      </header>

      <main class="layout">
        <div class="now-column">
          <NowPlaying
            sound={sound}
            playing={playing}
            statusText={statusText}
            volume={volume}
            withMedia={settings.withMedia}
            timerLabel={timerLabel}
            timerActive={remaining !== null}
            canSaveFavorite={settings.favorites.length < MAX_FAVORITES}
            isFavorite={currentFavorite !== null}
            onToggle={toggle}
            onVolume={setVolume}
            onOpenTimer={() => setSheet('timer')}
            onOpenAdjust={() => setSheet('adjust')}
            onSaveFavorite={toggleFavorite}
          />
          {error && (
            <p class="error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div class="library">
          {showInstallCard && (
            <section
              class="install-card"
              aria-labelledby="install-title"
              data-testid="install-card"
            >
              <Icon path={ICONS.install} size={24} />
              <div>
                <h2 id="install-title">Install the app</h2>
                <p>One tap from your home screen, with shortcuts. Works offline.</p>
              </div>
              <div class="button-row">
                <button
                  type="button"
                  class="primary"
                  data-testid="install"
                  onClick={() => void promptInstall()}
                >
                  Install
                </button>
                <button
                  type="button"
                  class="text-btn"
                  onClick={() => update({ installDismissed: true })}
                >
                  Not now
                </button>
              </div>
            </section>
          )}
          <Favorites
            favorites={settings.favorites}
            activeId={playing ? (currentFavorite?.id ?? null) : null}
            onPlay={playFavorite}
            onRemove={removeFavorite}
          />
          <SoundGrid selected={settings.sound} playing={playing} onSelect={selectSound} />
        </div>
      </main>

      <TimerSheet
        open={sheet === 'timer'}
        onClose={() => setSheet(null)}
        minutes={settings.timerMinutes}
        fadeSeconds={settings.timerFadeSeconds}
        endsAt={endsAt}
        playing={playing}
        onMinutes={setTimer}
        onFade={setTimerFade}
        onExtend={(m) => engine.extendSleepTimer(m * 60, settings.timerFadeSeconds)}
      />
      <AdjustSheet
        open={sheet === 'adjust'}
        onClose={() => setSheet(null)}
        sound={sound}
        value={per}
        onChange={setPerSound}
      />
      <SettingsSheet
        open={sheet === 'settings'}
        onClose={() => setSheet(null)}
        settings={settings}
        pwa={pwa}
        engine={engine}
        update={update}
        onWithMedia={setWithMedia}
        onReset={resetSettings}
        onApplyUpdate={applyUpdate}
        onOpenOnboarding={() => setShowOnboarding(true)}
      />
      <OnboardingDialog
        open={showOnboarding}
        onClose={() => dismissOnboarding()}
        onComplete={(sound) => dismissOnboarding(sound)}
        engine={engine}
        currentSound={settings.sound}
      />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
