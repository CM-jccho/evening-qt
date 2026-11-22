import { X } from 'lucide-react'

export interface ToastMessage {
  id: number
  text: string
  undo?: () => void
}

interface Props {
  message: ToastMessage | null
  undoLabel: string
  closeLabel: string
  onDismiss: () => void
}

export function Toast({ message, undoLabel, closeLabel, onDismiss }: Props) {
  if (!message) return null
  return (
    <div className="toast" role="status" key={message.id}>
      <span className="toast-text">{message.text}</span>
      {message.undo ? (
        <button
          type="button"
          className="toast-undo"
          onClick={() => {
            message.undo?.()
            onDismiss()
          }}
        >
          {undoLabel}
        </button>
      ) : null}
      <button type="button" className="toast-close" onClick={onDismiss} aria-label={closeLabel}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}
