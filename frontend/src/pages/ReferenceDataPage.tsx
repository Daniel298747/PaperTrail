import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { categoriesApi, providersApi } from '../api/endpoints'
import { keys, useCategories, useInvalidateLedger, useProviders } from '../api/queries'
import type { Category, Provider } from '../api/types'
import { Dialog } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { ErrorNotice, Field, FieldError, Loading, PageHeader } from '../components/ui'
import { plural } from '../lib/format'
import { useToast } from '../components/useToast'
import { errorMessage, fieldAria } from '../lib/forms'
import { useDocumentTitle } from '../lib/useDocumentTitle'

type Kind = 'provider' | 'category'

interface Target {
  kind: Kind
  id: string
  name: string
  billCount: number
  scheduleCount: number
  defaultCategoryId?: string | null
}

export function ReferenceDataPage() {
  useDocumentTitle('Providers & categories')
  const providers = useProviders()
  const categories = useCategories()
  const [renaming, setRenaming] = useState<Target | null>(null)
  const [deleting, setDeleting] = useState<Target | null>(null)

  return (
    <>
      <PageHeader
        eyebrow="Household"
        title="Providers & categories"
        lede="Providers are the companies that bill you; categories group bills for analytics. Something still in use can only be deleted by moving its bills elsewhere."
      />
      <div className="split collapse-md">
        <section className="span-7" aria-labelledby="providers-heading">
          <div className="section-head">
            <h2 id="providers-heading">Providers</h2>
          </div>
          <AddForm kind="provider" categories={categories.data ?? []} />
          {providers.isPending ? <Loading label="Loading providers…" />
            : providers.isError ? <ErrorNotice error={providers.error} onRetry={() => providers.refetch()} />
              : providers.data.length === 0 ? <p className="muted small">No providers yet. Add the companies that send you bills.</p>
                : (
                  <table className="ledger stack">
                    <caption className="sr-only">Providers</caption>
                    <thead>
                      <tr>
                        <th scope="col">Provider</th>
                        <th scope="col">Usual category</th>
                        <th scope="col" className="col-num">Bills</th>
                        <th scope="col" className="col-actions"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {providers.data.map((provider: Provider) => (
                        <tr key={provider.id}>
                          <td className="cell-main" style={{ fontWeight: 600 }}>{provider.name}</td>
                          <td className="cell-meta" data-label="Category">{provider.defaultCategory?.name ?? <span className="muted">None</span>}</td>
                          <td className="col-num cell-amount">
                            {provider.billCount}
                            {provider.scheduleCount > 0 && <span className="sub">{plural(provider.scheduleCount, 'schedule')}</span>}
                          </td>
                          <td className="col-actions cell-actions">
                            <span className="btn-row" style={{ justifyContent: 'flex-end' }}>
                              <button type="button" className="btn btn-text" aria-label={`Edit ${provider.name}`}
                                onClick={() => setRenaming({ kind: 'provider', id: provider.id, name: provider.name,
                                  billCount: provider.billCount, scheduleCount: provider.scheduleCount,
                                  defaultCategoryId: provider.defaultCategory?.id ?? null })}>
                                Edit
                              </button>
                              <button type="button" className="btn btn-text danger" aria-label={`Delete ${provider.name}`}
                                onClick={() => setDeleting({ kind: 'provider', id: provider.id, name: provider.name,
                                  billCount: provider.billCount, scheduleCount: provider.scheduleCount })}>
                                Delete
                              </button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
        </section>

        <section className="span-5 divided-left" aria-labelledby="categories-heading">
          <div className="section-head">
            <h2 id="categories-heading">Categories</h2>
          </div>
          <AddForm kind="category" categories={[]} />
          {categories.isPending ? <Loading label="Loading categories…" />
            : categories.isError ? <ErrorNotice error={categories.error} onRetry={() => categories.refetch()} />
              : (
                <table className="ledger stack">
                  <caption className="sr-only">Categories</caption>
                  <thead>
                    <tr>
                      <th scope="col">Category</th>
                      <th scope="col" className="col-num">Bills</th>
                      <th scope="col" className="col-actions"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.data.map((category: Category) => (
                      <tr key={category.id}>
                        <td className="cell-main" style={{ fontWeight: 600 }}>{category.name}</td>
                        <td className="col-num cell-amount">{category.billCount}</td>
                        <td className="col-actions cell-actions">
                          <span className="btn-row" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-text" aria-label={`Rename ${category.name}`}
                              onClick={() => setRenaming({ kind: 'category', id: category.id, name: category.name,
                                billCount: category.billCount, scheduleCount: category.scheduleCount })}>
                              Rename
                            </button>
                            <button type="button" className="btn btn-text danger" aria-label={`Delete ${category.name}`}
                              onClick={() => setDeleting({ kind: 'category', id: category.id, name: category.name,
                                billCount: category.billCount, scheduleCount: category.scheduleCount })}>
                              Delete
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
        </section>
      </div>

      {renaming && (
        <RenameDialog target={renaming} categories={categories.data ?? []} onClose={() => setRenaming(null)} />
      )}
      {deleting && (
        <DeleteDialog
          target={deleting}
          alternatives={deleting.kind === 'provider'
            ? (providers.data ?? []).filter((p) => p.id !== deleting.id)
            : (categories.data ?? []).filter((c) => c.id !== deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}

function AddForm({ kind, categories }: { kind: Kind; categories: Category[] }) {
  const client = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState<string | undefined>()
  const create = useMutation({
    mutationFn: () => kind === 'provider'
      ? providersApi.create({ name: name.trim(), defaultCategoryId: categoryId || null })
      : categoriesApi.create({ name: name.trim() }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: kind === 'provider' ? keys.providers : keys.categories })
      toast.show(`${kind === 'provider' ? 'Provider' : 'Category'} added: ${name.trim()}`)
      setName('')
      setCategoryId('')
    },
    onError: (cause) => setError(errorMessage(cause)),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError(`Enter a ${kind} name.`)
      return
    }
    setError(undefined)
    create.mutate()
  }

  const id = `new-${kind}`
  return (
    <form className="inline-form" onSubmit={submit} noValidate aria-label={`Add a ${kind}`}>
      <Field label={kind === 'provider' ? 'New provider' : 'New category'} htmlFor={id} error={error}>
        <input className="input" value={name} placeholder={kind === 'provider' ? 'Company name' : 'Category name'}
          onChange={(event) => setName(event.target.value)} {...fieldAria(id, error)} />
      </Field>
      {kind === 'provider' && (
        <Field label="Usual category" htmlFor="new-provider-default" optional>
          <select className="select" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}
            {...fieldAria('new-provider-default')}>
            <option value="">None</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </Field>
      )}
      <button type="submit" className="btn btn-secondary" disabled={create.isPending}>
        <Icon name="plus" />{create.isPending ? 'Adding…' : 'Add'}
      </button>
    </form>
  )
}

function RenameDialog({ target, categories, onClose }: { target: Target; categories: Category[]; onClose: () => void }) {
  const invalidate = useInvalidateLedger()
  const toast = useToast()
  const [name, setName] = useState(target.name)
  const [categoryId, setCategoryId] = useState(target.defaultCategoryId ?? '')
  const [error, setError] = useState<string | undefined>()
  const save = useMutation({
    mutationFn: () => target.kind === 'provider'
      ? providersApi.update(target.id, { name: name.trim(), defaultCategoryId: categoryId || null })
      : categoriesApi.rename(target.id, { name: name.trim() }),
    onSuccess: async () => {
      await invalidate()
      toast.show('Saved.')
      onClose()
    },
    onError: (cause) => setError(errorMessage(cause)),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={target.kind === 'provider' ? `Edit ${target.name}` : `Rename ${target.name}`}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={save.isPending} onClick={() => {
            if (!name.trim()) return setError('Enter a name.')
            setError(undefined)
            save.mutate()
          }}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <Field label="Name" htmlFor="rename-name" error={error}
        help={target.billCount > 0 ? `Renaming updates all ${plural(target.billCount, 'bill')} that use it.` : undefined}>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)}
          {...fieldAria('rename-name', error, target.billCount > 0)} />
      </Field>
      {target.kind === 'provider' && (
        <Field label="Usual category" htmlFor="rename-category" optional help="Pre-selected when you add a bill from this provider.">
          <select className="select" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}
            {...fieldAria('rename-category', undefined, true)}>
            <option value="">None</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </Field>
      )}
    </Dialog>
  )
}

/** Deleting something in use requires choosing where its bills and schedules move to. */
function DeleteDialog({ target, alternatives, onClose }: {
  target: Target
  alternatives: { id: string; name: string }[]
  onClose: () => void
}) {
  const invalidate = useInvalidateLedger()
  const toast = useToast()
  const inUse = target.billCount > 0 || target.scheduleCount > 0
  const [reassignTo, setReassignTo] = useState('')
  const [error, setError] = useState<string | undefined>()
  const remove = useMutation({
    mutationFn: () => target.kind === 'provider'
      ? providersApi.remove(target.id, reassignTo || undefined)
      : categoriesApi.remove(target.id, reassignTo || undefined),
    onSuccess: async () => {
      await invalidate()
      toast.show(inUse ? `${target.name} deleted; its bills were moved.` : `${target.name} deleted.`)
      onClose()
    },
    onError: (cause) => setError(errorMessage(cause)),
  })

  const usage = [
    target.billCount > 0 ? plural(target.billCount, 'bill') : null,
    target.scheduleCount > 0 ? plural(target.scheduleCount, 'recurring schedule') : null,
  ].filter(Boolean).join(' and ')

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Delete ${target.name}?`}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-danger-solid" disabled={remove.isPending || (inUse && !reassignTo)}
            onClick={() => remove.mutate()}>
            {remove.isPending ? 'Deleting…' : inUse ? 'Move and delete' : 'Delete'}
          </button>
        </>
      }
    >
      {inUse ? (
        <>
          <p>
            <strong>{target.name}</strong> is used by {usage}. Choose the {target.kind} they should move to; nothing is
            deleted except {target.name} itself.
          </p>
          {alternatives.length === 0 ? (
            <p className="notice">Add another {target.kind} first, so the bills have somewhere to go.</p>
          ) : (
            <Field label={`Move to ${target.kind}`} htmlFor="reassign" error={error}>
              <select className="select" value={reassignTo} onChange={(event) => setReassignTo(event.target.value)}
                {...fieldAria('reassign', error)}>
                <option value="">Choose a {target.kind}</option>
                {alternatives.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </Field>
          )}
        </>
      ) : (
        <>
          <p><strong>{target.name}</strong> isn&rsquo;t used by any bill or schedule, so it can be deleted safely.</p>
          <FieldError message={error} />
        </>
      )}
    </Dialog>
  )
}
