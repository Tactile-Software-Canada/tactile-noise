import { useEffect, useState } from 'preact/hooks'
import type { AudioEngine, Diagnostics } from '../audio/engine'
import { checkForUpdates, promptInstall, type PwaState } from '../pwa'
import { FADE_IN_OPTIONS, type Settings, type Theme } from '../settings'
import { SOUNDS } from '../sounds'
import { ChipGroup, Select, Switch } from './controls'
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
      <section class="settings-section" aria-labelledby="set-playback">
        <h3 id="set-playback">Playback</h3>
        <Select
          id="fade-in"
          label="Fade in when starting"
          value={s.fadeInSeconds}
          options={FADE_IN_OPTIONS.map((v) => [v, v === 0 ? 'Off' : `${v} seconds`])}
          onChange={(v) => p.update({ fadeInSeconds: v })}
        />
        <Select
          id="output"
          label="Playback mode"
          hint={
            s.output === 'media'
              ? 'Shows play/stop controls in notifications and on the lock screen. Music or videos started in other apps may stop it.'
              : 'Keeps playing alongside music or videos in other apps, but without notification or lock-screen controls.'
          }
          value={s.output}
          options={[
            ['media', 'With media controls (recommended)'],
            ['direct', 'Mix with other audio'],
          ]}
          onChange={(v) => {
            p.update({ output: v })
            p.engine.setOutput(v)
          }}
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

      <DiagnosticsSection engine={p.engine} open={p.open} />

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
            onClick={() => {
              p.onClose()
              p.onOpenOnboarding()
            }}
          >
            Replay tour
          </button>
        </div>
        <details class="help">
          <summary>Keyboard shortcuts</summary>
          <dl class="shortcuts">
            <dt>Space</dt>
            <dd>Play or stop</dd>
            <dt>↑ ↓ or ← →</dt>
            <dd>Volume (hold Shift for 1% steps)</dd>
            <dt>1–9</dt>
            <dd>Choose one of the first nine sounds</dd>
            <dt>[ and ]</dt>
            <dd>Previous or next sound</dd>
            <dt>T</dt>
            <dd>Sleep timer</dd>
          </dl>
        </details>
        <details class="help">
          <summary>About</summary>
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
        <p class="hint">
          If you hear gaps or crackles, play the sound with this open and check the numbers.
        </p>
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
