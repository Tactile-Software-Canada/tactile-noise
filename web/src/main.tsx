import { render } from 'preact'
import { AudioEngine } from './audio/engine'
import { isSoundId } from './audio/soundIds'
import { initPwa } from './pwa'
import { App } from './ui/App'
import './styles.css'

initPwa()

// Manifest shortcuts open ./?sound=rain. Browsers need a tap before audio can
// start, so the sound is pre-selected and the Play button does the rest.
const params = new URLSearchParams(location.search)
const requested = params.get('sound')
const forceOnboarding = params.has('onboarding') || params.has('tour')
if (requested !== null || forceOnboarding) history.replaceState(null, '', location.pathname)

const engine = new AudioEngine()
// Load and warm up the audio worklet now, so Play starts instantly and the
// first seconds don't run unoptimised code.
engine.prepare()
// Handy for debugging on a phone via remote devtools, and used by e2e tests.
;(window as unknown as { benGen: unknown }).benGen = {
  engine,
  resetOnboarding: () => {
    try {
      const raw = localStorage.getItem('ben-gen:settings:v1')
      const current = raw ? JSON.parse(raw) : {}
      localStorage.setItem(
        'ben-gen:settings:v1',
        JSON.stringify({ ...current, onboardingDismissed: false }),
      )
      location.reload()
    } catch {}
  },
}

render(
  <App
    engine={engine}
    initialSound={isSoundId(requested) ? requested : null}
    forceOnboarding={forceOnboarding}
  />,
  document.getElementById('app')!,
)
