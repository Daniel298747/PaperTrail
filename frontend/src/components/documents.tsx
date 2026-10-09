import { useId, useRef, useState } from 'react'

import { ACCEPT_ATTRIBUTE, checkStatementFile } from '../lib/statements'
import { Icon } from './Icon'
import { FieldError } from './ui'

export function StatementDropzone({ title, hint, busy, error, onFile }: {
  title: string
  hint?: string
  busy?: boolean
  error?: string | null
  onFile: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const inputId = useId()

  function accept(file: File | undefined) {
    if (!file) return
    const problem = checkStatementFile(file)
    setLocalError(problem)
    if (!problem) onFile(file)
  }

  return (
    <div
      className={`dropzone ${dragging ? 'dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        accept(event.dataTransfer.files[0])
      }}
    >
      <strong>{title}</strong>
      <p>{hint ?? 'PDF, JPG or PNG, up to 10 MB. Drop the file here or choose it from your device.'}</p>
      <div className="btn-row">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Icon name="upload" />
          {busy ? 'Uploading…' : 'Choose file'}
        </button>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-label={title}
        data-testid="statement-input"
        onChange={(event) => {
          accept(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      <FieldError message={localError ?? error ?? undefined} />
    </div>
  )
}
