import { useEffect, useRef } from 'react'

interface Props {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  minRows?: number
  readOnly?: boolean
  maxLength?: number
}

/** A textarea that grows with its words; no fixed scroll box between the two of you. */
export function AutoTextarea({ id, value, onChange, placeholder, label, minRows = 2, readOnly, maxLength }: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 64)}px`
  }, [value])

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        className="field-input"
        value={value}
        rows={minRows}
        placeholder={placeholder}
        readOnly={readOnly}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
