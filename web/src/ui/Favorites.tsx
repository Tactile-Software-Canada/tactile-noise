import { useState } from 'preact/hooks'
import type { Favorite } from '../settings'
import { soundInfo } from '../sounds'
import { Icon } from './Icon'
import { ICONS } from './icons'
import { pure } from './pure'

interface Props {
  favorites: Favorite[]
  activeId: string | null
  onPlay(f: Favorite): void
  onRemove(id: string): void
}

export function favoriteLabel(f: Favorite): string {
  const info = soundInfo(f.sound)
  const parts = [info.name, `${f.volume}%`]
  if (info.intensityLabel && f.intensity !== 50)
    parts.push(`${info.intensityLabel} ${f.intensity}%`)
  if (f.tilt !== 0) parts.push(f.tilt < 0 ? `warmer ${-f.tilt}%` : `brighter ${f.tilt}%`)
  return parts.join(' · ')
}

export const Favorites = pure(function Favorites({ favorites, activeId, onPlay, onRemove }: Props) {
  const [editing, setEditing] = useState(false)
  if (favorites.length === 0) return null
  return (
    <section class="library-section" aria-labelledby="fav-heading">
      <div class="section-header">
        <h2 id="fav-heading" class="section-title">
          Favorites
        </h2>
        <button
          type="button"
          class="text-btn"
          aria-pressed={editing}
          onClick={() => setEditing(!editing)}
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>
      <ul class="favorites">
        {favorites.map((f) => {
          const label = favoriteLabel(f)
          return (
            <li key={f.id} class={f.id === activeId ? 'active' : undefined}>
              <button type="button" class="fav" onClick={() => onPlay(f)}>
                <Icon path={soundInfo(f.sound).icon} size={20} />
                <span>{label}</span>
              </button>
              {editing && (
                <button
                  type="button"
                  class="fav-remove"
                  aria-label={`Remove favorite ${label}`}
                  onClick={() => {
                    onRemove(f.id)
                    if (favorites.length === 1) setEditing(false)
                  }}
                >
                  <Icon path={ICONS.close} size={18} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
})
