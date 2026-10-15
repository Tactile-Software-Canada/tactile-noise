import { Icon } from './Icon'
import { ICONS } from './icons'

export interface ToastMessage {
  id: number
  text: string
  action?: { label: string; run(): void }
}

interface Props {
  toast: ToastMessage | null
  onDismiss(): void
}

/** A small notice at the bottom of the screen, announced politely to screen readers. */
export function Toast({ toast, onDismiss }: Props) {
  return (
    <div class="toast-region" role="status" aria-live="polite">
      {toast && (
        <div class="toast" key={toast.id}>
          <span>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              class="text-btn"
              onClick={() => {
                toast.action!.run()
                onDismiss()
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button type="button" class="icon-btn small" aria-label="Dismiss" onClick={onDismiss}>
            <Icon path={ICONS.close} size={18} />
          </button>
        </div>
      )}
    </div>
  )
}
