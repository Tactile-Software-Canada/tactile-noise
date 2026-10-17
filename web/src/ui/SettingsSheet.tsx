import { useEffect, useState } from 'preact/hooks'
import type { AudioEngine, Diagnostics, OutputMode } from '../audio/engine'
import {
  checkForUpdates,
  isAndroid,
  isIos,
  isMacSafari,
  promptInstall,
  type PwaState,
} from '../pwa'
import { FADE_IN_OPTIONS, type Settings, type Theme } from '../settings'
import { SOUNDS } from '../sounds'
import { ChipGroup, ChoiceCards, Select, Switch } from './controls'
import { Icon } from './Icon'
import { ICONS } from './icons'
import { Sheet } from './Sheet'

interface Props {
  open: boolean
  onClose(): void
  settings: Settings
  pwa: PwaState
  engine: AudioEngine
  update(patch: Partial<Settings>): void
  onWithMedia(on: boolean): void
  onReset(): void
  onApplyUpdate(): void
  onOpenOnboarding(): void
}

export function SettingsSheet(p: Props) {
  const s = p.settings
  const [checking, setChecking] = useState<'idle' | 'checking' | 'done'>('idle')
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <Sheet id="settings-sheet" title="Settings" open={p.open} onClose={p.onClose}>
      {isAndroid() && (
        <section class="settings-section" aria-labelledby="set-mode">
          <h3 id="set-mode">Playback mode</h3>
          <ChoiceCards<OutputMode>
            name="output"
            legend="Playback mode"
            value={s.output}
            options={[
              [
                'media',
                'With media controls',
                'Play and stop from notifications and the lock screen. Music or videos in other apps may stop it.',
              ],
              [
                'direct',
                'Mix with other audio',
                'Keeps playing alongside music or videos in other apps, without notification or lock-screen controls.',
              ],
            ]}
            onChange={(v) => {
              p.update({ output: v })
              p.engine.setOutput(v)
              // The quieter volume is only offered when mixing; drop back to the normal one.
              if (v === 'media' && s.withMedia) p.onWithMedia(false)
            }}
          />
          {s.output === 'direct' && (
            <>
              <Switch
                id="with-media"
                label="Make quieter while media is playing"
                hint={`Switch to a quieter volume (${s.mediaVolume}%) while music or video plays.`}
                checked={s.withMedia}
                onChange={p.onWithMedia}
              />
              <Select
                id="media-volume"
                label="“Media is playing” volume"
                value={s.mediaVolume}
                options={[5, 10, 15, 20, 25, 30, 40, 50].map((v) => [v, `${v}%`])}
                onChange={(v) => {
                  p.update({ mediaVolume: v })
                  if (s.withMedia) p.engine.setVolume(v)
                }}
              />
            </>
          )}
        </section>
      )}

      <section class="settings-section" aria-labelledby="set-playback">
        <h3 id="set-playback">Playback</h3>
        <Select
          id="fade-in"
          label="Fade in when starting"
          value={s.fadeInSeconds}
          options={FADE_IN_OPTIONS.map((v) => [v, v === 0 ? 'Off' : `${v} seconds`])}
          onChange={(v) => p.update({ fadeInSeconds: v })}
        />
        <Switch
          id="mono"
          label="Mono audio"
          hint="Play the same sound in both ears."
          checked={s.mono}
          onChange={(on) => {
            p.update({ mono: on })
            p.engine.setMono(on)
          }}
        />
      </section>

      <section class="settings-section" aria-labelledby="set-appearance">
        <h3 id="set-appearance">Appearance</h3>
        <ChipGroup<Theme>
          name="theme"
          legend="Theme"
          value={s.theme}
          options={[
            ['system', 'System'],
            ['dark', 'Dark'],
            ['light', 'Light'],
          ]}
          onChange={(v) => p.update({ theme: v })}
        />
      </section>

      <section class="settings-section" aria-labelledby="set-app">
        <h3 id="set-app">App</h3>
        <InstallRow pwa={p.pwa} />
        <div class="setting-row">
          <div>
            <p class="row-title">Version</p>
            <p class="hint">
              {__APP_VERSION__}
              {p.pwa.offlineReady || p.pwa.installed ? ' · works offline' : ''}
            </p>
          </div>
          {p.pwa.updateReady ? (
            <button type="button" class="secondary" onClick={p.onApplyUpdate}>
              <Icon path={ICONS.refresh} size={18} />
              Update now
            </button>
          ) : (
            <button
              type="button"
              class="secondary"
              disabled={checking === 'checking'}
              onClick={async () => {
                setChecking('checking')
                await checkForUpdates().catch(() => {})
                setChecking('done')
              }}
            >
              {checking === 'checking'
                ? 'Checking…'
                : checking === 'done'
                  ? 'Up to date'
                  : 'Check for updates'}
            </button>
          )}
        </div>
        <div class="setting-row">
          <div>
            <p class="row-title">Reset settings</p>
            <p class="hint">Volumes, sound adjustments, timer and favorites.</p>
          </div>
          {confirmReset ? (
            <div class="button-row">
              <button
                type="button"
                class="secondary danger"
                onClick={() => {
                  setConfirmReset(false)
                  p.onReset()
                }}
              >
                Reset everything
              </button>
              <button type="button" class="text-btn" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" class="secondary" onClick={() => setConfirmReset(true)}>
              Reset…
            </button>
          )}
        </div>
      </section>

      {/* Development builds only; stripped from production. */}
      {import.meta.env.DEV && <DiagnosticsSection engine={p.engine} open={p.open} />}

      <section class="settings-section" aria-labelledby="set-help">
        <h3 id="set-help">Help</h3>
        <div class="setting-row">
          <div>
            <p class="row-title">Welcome tour</p>
            <p class="hint">Revisit the first-time introduction and animated sound guide.</p>
          </div>
          <button
            type="button"
            class="secondary"
            data-testid="replay-tour"
            onClick={() => {
              p.onClose()
              p.onOpenOnboarding()
            }}
          >
            Replay tour
          </button>
        </div>
        <details class="help">
          <summary>About</summary>
          <p>
            Made by{' '}
            <a href="https://tactile.software" target="_blank" rel="noopener">
              Tactile Software
            </a>
            : software you can feel the quality of.
          </p>
          <p>
            Every sound ({SOUNDS.length} of them) is generated live on your device, so it never
            loops or repeats, and nothing is downloaded or sent anywhere.
          </p>
          <p>
            Not a medical device. Listen at a comfortable, low volume, especially with headphones
            and for long periods.
          </p>
        </details>
      </section>
    </Sheet>
  )
}

function InstallRow({ pwa }: { pwa: PwaState }) {
  if (pwa.installed) {
    return (
      <div class="setting-row">
        <div>
          <p class="row-title">Installed</p>
          <p class="hint">Running as an app.</p>
        </div>
      </div>
    )
  }
  return (
    <div class="setting-row">
      <div>
        <p class="row-title">Install app</p>
        <p class="hint">
          {pwa.canInstall
            ? 'Adds it to your home screen with shortcuts, and opens without the browser.'
            : isIos()
              ? 'Tap Share in Safari, then choose “Add to Home Screen”.'
              : isMacSafari()
                ? 'In Safari, choose File → Add to Dock…'
                : 'In your browser menu, choose “Add to home screen” or “Install”.'}
        </p>
      </div>
      {pwa.canInstall && (
        <button type="button" class="secondary" onClick={() => void promptInstall()}>
          <Icon path={ICONS.install} size={18} />
          Install
        </button>
      )}
    </div>
  )
}

/** Live engine numbers while the section is open; costs a little CPU, so off otherwise. */
function DiagnosticsSection({ engine, open }: { engine: AudioEngine; open: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [d, setD] = useState<Diagnostics>(() => engine.getDiagnostics())
  const active = open && expanded

  useEffect(() => {
    if (!active) return
    engine.setDiagnostics(true)
    setD(engine.getDiagnostics())
    const id = setInterval(() => setD(engine.getDiagnostics()), 1000)
    return () => {
      clearInterval(id)
      engine.setDiagnostics(false)
    }
  }, [active, engine])

  const fmt = (v: number | null, unit: string) => (v === null ? '—' : `${v}${unit}`)
  return (
    <section class="settings-section" aria-labelledby="set-diag">
      <h3 id="set-diag">Diagnostics</h3>
      <details
        class="help"
        onToggle={(e) => setExpanded((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>Audio engine</summary>
        <dl class="diag" aria-live="off">
          <dt>Engine</dt>
          <dd>{d.contextState}</dd>
          <dt>Sample rate</dt>
          <dd>{fmt(d.sampleRate, ' Hz')}</dd>
          <dt>Output latency</dt>
          <dd>{fmt(d.latencyMs, ' ms')}</dd>
          <dt>Generator load</dt>
          <dd>
            {d.load === null ? '— (press Play)' : `${(d.load * 100).toFixed(1)}% of real time`}
          </dd>
          <dt>Slowest block</dt>
          <dd>{d.maxBlockMs === null ? '—' : `${d.maxBlockMs} ms (budget ≈3 ms)`}</dd>
          <dt>Dropouts since Play</dt>
          <dd>
            {d.dropouts === null
              ? 'Not reported by this browser'
              : `${d.dropouts.events} (${d.dropouts.ms} ms)`}
          </dd>
        </dl>
      </details>
    </section>
  )
}
