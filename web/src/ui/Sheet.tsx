import type { ComponentChildren } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { Icon } from './Icon'
import { ICONS } from './icons'

interface Props {
  id: string
  title: string
  open: boolean
  onClose(): void
  children: ComponentChildren
}

/**
 * A modal panel: a bottom sheet on phones, a centred dialog on wider screens.
 * Built on native <dialog>.showModal(), so the browser traps focus, closes on
 * Escape and returns focus to the button that opened it.
 */
export function Sheet({ id, title, open, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      id={id}
      class="sheet"
      aria-labelledby={`${id}-title`}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> itself.
        if (e.target === ref.current) onClose()
      }}
    >
      <div class="sheet-inner">
        <header class="sheet-header">
          <h2 id={`${id}-title`}>{title}</h2>
          <button type="button" class="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon path={ICONS.close} />
          </button>
        </header>
        {/* Contents only exist while open: closed panels cost nothing to re-render. */}
        <div class="sheet-body">{open && children}</div>
      </div>
    </dialog>
  )
}
