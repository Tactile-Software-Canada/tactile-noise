import type { ComponentChildren } from 'preact'
import { Icon } from './Icon'
import { ICONS } from './icons'

interface SliderProps {
  id: string
  label: string
  hint?: string
  min: number
  max: number
  value: number
  valueText: string
  display?: string
  /** Show −/+ buttons that move by `step` (large targets for fine control). */
  stepButtons?: boolean
  step?: number
  onInput(v: number): void
}

export function Slider({
  id,
  label,
  hint,
  min,
  max,
  value,
  valueText,
  display,
  stepButtons,
  step = 1,
  onInput,
}: SliderProps) {
  const clampTo = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <div class="field slider">
      <div class="field-row">
        <label for={id}>{label}</label>
        <output for={id} aria-hidden="true">
          {display ?? valueText}
        </output>
      </div>
      <div class="slider-row">
        {stepButtons && (
          <button
            type="button"
            class="icon-btn small"
            aria-label={`${label}: down`}
            disabled={value <= min}
            onClick={() => onInput(clampTo(value - step))}
          >
            <Icon path={ICONS.minus} size={20} />
          </button>
        )}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          aria-valuetext={valueText}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onInput={(e) => onInput(Number(e.currentTarget.value))}
        />
        {stepButtons && (
          <button
            type="button"
            class="icon-btn small"
            aria-label={`${label}: up`}
            disabled={value >= max}
            onClick={() => onInput(clampTo(value + step))}
          >
            <Icon path={ICONS.plus} size={20} />
          </button>
        )}
      </div>
      {hint && (
        <p class="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  )
}

interface SwitchProps {
  id: string
  label: string
  hint?: string
  checked: boolean
  onChange(on: boolean): void
}

export function Switch({ id, label, hint, checked, onChange }: SwitchProps) {
  return (
    <div class="field switch">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <label for={id}>{label}</label>
      {hint && (
        <p class="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  )
}

interface SelectProps<T extends string | number> {
  id: string
  label: string
  hint?: string
  value: T
  options: [T, string][]
  onChange(v: T): void
}

export function Select<T extends string | number>({
  id,
  label,
  hint,
  value,
  options,
  onChange,
}: SelectProps<T>) {
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <select
        id={id}
        value={String(value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => {
          const raw = e.currentTarget.value
          const match = options.find(([v]) => String(v) === raw)
          if (match) onChange(match[0])
        }}
      >
        {options.map(([v, text]) => (
          <option key={String(v)} value={String(v)}>
            {text}
          </option>
        ))}
      </select>
      {hint && (
        <p class="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  )
}

interface ChipGroupProps<T extends string | number> {
  name: string
  legend: string
  value: T
  options: [T, string][]
  onChange(v: T): void
  children?: ComponentChildren
}

/** A radio group drawn as chips (native radios: arrow keys and screen readers just work). */
export function ChipGroup<T extends string | number>({
  name,
  legend,
  value,
  options,
  onChange,
  children,
}: ChipGroupProps<T>) {
  return (
    <fieldset class="chip-group">
      <legend>{legend}</legend>
      <div class="chips">
        {options.map(([v, text]) => (
          <label class="chip" key={String(v)}>
            <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
            <span>{text}</span>
          </label>
        ))}
      </div>
      {children}
    </fieldset>
  )
}
