import { useEffect, useRef, useState } from 'preact/hooks'
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

/** What a favorite sets besides the sound, e.g. "Volume 40% · Rainfall 27% · Warmer 60%". */
export function favoriteDetails(f: Favorite): string {
  const info = soundInfo(f.sound)
  const parts = [`Volume ${f.volume}%`]
  if (info.intensityLabel && f.intensity !== 50)
    parts.push(`${info.intensityLabel} ${f.intensity}%`)
  for (const e of info.extras ?? []) {
    const v = f.extras?.[e.id] ?? e.default
    if (v !== e.default) parts.push(`${e.label} ${v}%`)
  }
  if (f.tilt !== 0) parts.push(f.tilt < 0 ? `Warmer ${-f.tilt}%` : `Brighter ${f.tilt}%`)
  return parts.join(' · ')
}

export function favoriteLabel(f: Favorite): string {
  return `${soundInfo(f.sound).name} · ${favoriteDetails(f)}`
}

export const Favorites = pure(function Favorites({ favorites, activeId, onPlay, onRemove }: Props) {
  const [editing, setEditing] = useState(false)
  // The favorite waiting for "Remove" to be confirmed: a mix can take a while to get right.
  const [confirming, setConfirming] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Move focus into the confirmation, so keyboard and screen reader users land on it.
  useEffect(() => {
    if (confirming) listRef.current?.querySelector<HTMLElement>('.fav-confirm .text-btn')?.focus()
  }, [confirming])

  if (favorites.length === 0) return null

  const cancel = (id: string) => {
    setConfirming(null)
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLElement>(`[data-remove="${id}"]`)?.focus(),
    )
  }

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
          data-testid="favorites-edit"
          onClick={() => {
            setEditing(!editing)
            setConfirming(null)
          }}
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>
      <ul class="favorites" ref={listRef}>
        {favorites.map((f) => {
          const info = soundInfo(f.sound)
          const label = favoriteLabel(f)
          return (
            <li
              key={f.id}
              class={confirming === f.id ? 'confirming' : f.id === activeId ? 'active' : undefined}
            >
              {confirming === f.id ? (
                <div class="fav-confirm" role="group" aria-label={`Remove favorite ${label}?`}>
                  <span class="fav-text">
                    <span class="fav-name">Remove {info.name}?</span>
                    <span class="fav-details">{favoriteDetails(f)}</span>
                  </span>
                  <div class="button-row">
                    <button
                      type="button"
                      class="text-btn"
                      data-testid="favorite-remove-cancel"
                      onClick={() => cancel(f.id)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      class="secondary danger"
                      data-testid="favorite-remove-confirm"
                      onClick={() => {
                        setConfirming(null)
                        onRemove(f.id)
                        if (favorites.length === 1) setEditing(false)
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    class="fav"
                    data-testid="favorite-item"
                    data-sound={f.sound}
                    aria-label={label}
                    onClick={() => onPlay(f)}
                  >
                    <Icon path={info.icon} size={22} />
                    <span class="fav-text" aria-hidden="true">
                      <span class="fav-name">{info.name}</span>
                      <span class="fav-details">{favoriteDetails(f)}</span>
                    </span>
                  </button>
                  {editing && (
                    <button
                      type="button"
                      class="fav-remove"
                      aria-label={`Remove favorite ${label}`}
                      data-testid="favorite-remove"
                      data-remove={f.id}
                      onClick={() => setConfirming(f.id)}
                    >
                      <Icon path={ICONS.close} size={18} />
                    </button>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
})
