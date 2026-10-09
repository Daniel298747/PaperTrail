import { useState } from 'react'

import { documentsApi } from '../api/endpoints'
import type { DocumentLink } from '../api/types'
import { errorMessage } from '../lib/forms'
import { fileKind } from '../lib/format'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { ErrorNotice, Loading } from './ui'
import { useToast } from './useToast'

interface ViewableDocument {
  id: string
  filename: string
  contentType: string
  versionNumber?: number
}

/** Preview and download go through short-lived signed URLs requested on demand. */
export function useDocumentViewer() {
  const toast = useToast()
  const [previewing, setPreviewing] = useState<ViewableDocument | null>(null)
  const [link, setLink] = useState<DocumentLink | null>(null)
  const [error, setError] = useState<unknown>(null)

  async function preview(document: ViewableDocument) {
    setPreviewing(document)
    setLink(null)
    setError(null)
    try {
      setLink(await documentsApi.link(document.id, false))
    } catch (cause) {
      setError(cause)
    }
  }

  async function download(document: ViewableDocument) {
    try {
      const signed = await documentsApi.link(document.id, true)
      if (signed.url.startsWith('blob:')) {
        // The demo's in-browser files have no Content-Disposition header, so name the download here.
        const anchor = window.document.createElement('a')
        anchor.href = signed.url
        anchor.download = signed.filename
        anchor.click()
      } else {
        window.location.assign(signed.url)
      }
    } catch (cause) {
      toast.show(errorMessage(cause), { tone: 'error' })
    }
  }

  const close = () => {
    setPreviewing(null)
    setLink(null)
  }

  const title = previewing
    ? `${previewing.versionNumber ? `Version ${previewing.versionNumber} · ` : ''}${previewing.filename}`
    : ''

  const dialog = (
    <Dialog
      open={previewing !== null}
      onClose={close}
      wide
      title={title}
      footer={previewing && (
        <>
          {link && (
            <a className="btn btn-secondary" href={link.url} target="_blank" rel="noopener noreferrer">
              Open in new tab
            </a>
          )}
          <button type="button" className="btn btn-primary" onClick={() => download(previewing)}>
            <Icon name="download" />
            Download
          </button>
        </>
      )}
    >
      {error ? <ErrorNotice error={error} title="The preview could not be opened" />
        : !link ? <Loading label="Fetching a secure link…" />
          : fileKind(link.contentType) === 'PDF'
            ? <iframe className="preview-frame" src={link.url} title={`Preview of ${link.filename}`} />
            : <img className="preview-image" src={link.url} alt={`Statement image ${link.filename}`} />}
      {link && <p className="small muted">This link expires in a few minutes; reopen the preview for a fresh one.</p>}
    </Dialog>
  )

  return { preview, download, dialog }
}
