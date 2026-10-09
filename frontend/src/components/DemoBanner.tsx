import { useState } from 'react'

import { Icon } from './Icon'

/** Shown in demo builds only: where the data lives, and a way back to the original demo household. */
export function DemoBanner() {
  const [resetting, setResetting] = useState(false)

  async function reset() {
    if (!window.confirm('Reset the demo? Every change made in this browser is discarded and the demo household is rebuilt.')) {
      return
    }
    setResetting(true)
    const { resetDemo } = await import('../demo/store')
    await resetDemo()
    window.location.assign(import.meta.env.BASE_URL)
  }

  return (
    <div className="demo-banner" role="note">
      <Icon name="alert" />
      <span>
        <strong>Demo mode.</strong> PaperTrail is running entirely in your browser; changes are saved on this
        device only.
      </span>
      <button type="button" className="btn btn-text btn-small" disabled={resetting} onClick={() => void reset()}>
        {resetting ? 'Resetting…' : 'Reset demo'}
      </button>
    </div>
  )
}
