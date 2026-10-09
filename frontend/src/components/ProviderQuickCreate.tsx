import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { providersApi } from '../api/endpoints'
import { keys, useCategories } from '../api/queries'
import type { Provider } from '../api/types'
import { Dialog } from './Dialog'
import { Field } from './ui'
import { errorMessage, fieldAria } from '../lib/forms'

/** Add a provider without leaving the bill or schedule form. */
export function ProviderQuickCreate({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: (provider: Provider) => void
}) {
  const client = useQueryClient()
  const categories = useCategories()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState<string | undefined>()
  const create = useMutation({
    mutationFn: () => providersApi.create({ name: name.trim(), defaultCategoryId: categoryId || null }),
    onSuccess: async (provider) => {
      await client.invalidateQueries({ queryKey: keys.providers })
      onCreated(provider)
      setName('')
      setCategoryId('')
      onClose()
    },
    onError: (cause) => setError(errorMessage(cause)),
  })

  function submit() {
    if (!name.trim()) {
      setError('Enter the provider name.')
      return
    }
    setError(undefined)
    create.mutate()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New provider"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Add provider'}
          </button>
        </>
      }
    >
      <Field label="Name" htmlFor="new-provider-name" error={error} help="The company that sends the bill.">
        <input className="input" value={name} onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
          }}
          {...fieldAria('new-provider-name', error, true)} />
      </Field>
      <Field label="Usual category" htmlFor="new-provider-category" optional>
        <select className="select" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}
          {...fieldAria('new-provider-category')}>
          <option value="">None</option>
          {categories.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </Field>
    </Dialog>
  )
}
