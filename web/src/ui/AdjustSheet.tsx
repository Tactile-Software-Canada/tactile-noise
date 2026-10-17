import type { SoundSettings } from '../settings'
import { extraDefaults, type SoundInfo } from '../sounds'
import { Slider } from './controls'
import { Sheet } from './Sheet'

interface Props {
  open: boolean
  onClose(): void
  sound: SoundInfo
  value: SoundSettings
  onChange(patch: Partial<SoundSettings>): void
}

export function toneText(t: number): string {
  if (t === 0) return 'Neutral'
  return t < 0 ? `Warmer ${-t}%` : `Brighter ${t}%`
}

export function AdjustSheet({ open, onClose, sound, value, onChange }: Props) {
  const extras = sound.extras ?? []
  const isDefault =
    value.intensity === 50 &&
    value.tilt === 0 &&
    extras.every((e) => (value.extras?.[e.id] ?? e.default) === e.default)
  return (
    <Sheet id="adjust-sheet" title={`Adjust ${sound.name}`} open={open} onClose={onClose}>
      {sound.intensityLabel && (
        <Slider
          id="intensity"
          label={sound.intensityLabel}
          min={0}
          max={100}
          value={value.intensity}
          valueText={`${value.intensity} percent`}
          display={`${value.intensity}%`}
          stepButtons
          step={5}
          onInput={(v) => onChange({ intensity: v })}
        />
      )}
      {extras.map((e) => {
        const v = value.extras?.[e.id] ?? e.default
        return (
          <Slider
            key={e.id}
            id={`extra-${e.id}`}
            label={e.label}
            hint={e.hint}
            min={0}
            max={100}
            value={v}
            valueText={`${v} percent`}
            display={`${v}%`}
            stepButtons
            step={5}
            onInput={(next) => onChange({ extras: { ...value.extras, [e.id]: next } })}
          />
        )
      })}
      <Slider
        id="tilt"
        label="Tone"
        hint="Warmer (darker) to the left, brighter to the right."
        min={-100}
        max={100}
        value={value.tilt}
        valueText={toneText(value.tilt)}
        stepButtons
        step={10}
        onInput={(v) => onChange({ tilt: v })}
      />
      <p class="hint">Saved for {sound.name} only. Other sounds keep their own settings.</p>
      <button
        type="button"
        class="secondary"
        disabled={isDefault}
        data-testid="adjust-reset"
        onClick={() => onChange({ intensity: 50, tilt: 0, extras: extraDefaults(sound) })}
      >
        Reset to default
      </button>
    </Sheet>
  )
}
