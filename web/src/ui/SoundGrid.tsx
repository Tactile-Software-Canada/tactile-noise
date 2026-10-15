import type { SoundId } from '../audio/soundIds'
import { CATEGORIES, SOUNDS } from '../sounds'
import { Icon } from './Icon'
import { pure } from './pure'

interface Props {
  selected: SoundId
  playing: boolean
  onSelect(id: SoundId): void
}

/**
 * All sounds, grouped by category. One radio group overall (arrow keys move
 * through every sound), with a heading per category.
 */
export const SoundGrid = pure(function SoundGrid({ selected, playing, onSelect }: Props) {
  return (
    <fieldset class="library-section sounds">
      <legend class="section-title">Sounds</legend>
      {CATEGORIES.map((cat) => (
        <div class="category" role="group" aria-labelledby={`cat-${cat.id}`} key={cat.id}>
          <h3 class="category-title" id={`cat-${cat.id}`}>
            {cat.name}
          </h3>
          <div class="sound-grid">
            {SOUNDS.filter((s) => s.category === cat.id).map((s) => {
              const index = SOUNDS.indexOf(s)
              const isSelected = selected === s.id
              return (
                <label class="sound-tile" key={s.id} style={{ '--hue': s.hue }}>
                  <input
                    type="radio"
                    name="sound"
                    value={s.id}
                    checked={isSelected}
                    onChange={() => onSelect(s.id)}
                    aria-describedby={`desc-${s.id}`}
                    aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}
                  />
                  <span class="tile-body">
                    <Icon path={s.icon} size={26} />
                    <span class="tile-name">{s.name}</span>
                    <span class="tile-desc" id={`desc-${s.id}`}>
                      {s.description}
                    </span>
                    {isSelected && playing && (
                      <span class="eq" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </fieldset>
  )
})
