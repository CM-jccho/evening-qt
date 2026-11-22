import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  closeLabel: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

/** A native dialog: the browser keeps the focus inside and returns it on close. */
export function Dialog({ open, title, closeLabel, onClose, children, wide }: Props) {
  const ref = useRef<HTMLDialogElement | null>(null)
  const titleId = `dialog-${title.replace(/\s+/g, '-')}`

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={wide ? 'dialog dialog-wide' : 'dialog'}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="dialog-body">
        <div className="dialog-head">
          <h2 id={titleId} className="dialog-title">
            {title}
          </h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={closeLabel}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
