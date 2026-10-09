import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { z } from 'zod'

import { ApiError } from '../api/client'
import { billsApi, documentsApi } from '../api/endpoints'
import { useBill, useCategories, useInvalidateLedger, useProviders } from '../api/queries'
import type { BillDetail, BillInput } from '../api/types'
import { Icon } from '../components/Icon'
import { ProviderQuickCreate } from '../components/ProviderQuickCreate'
import {
  ErrorNotice,
  Field,
  Loading,
  PageHeader,
} from '../components/ui'
import { moneyParts } from '../lib/format'
import { useHousehold } from '../auth/useAuth'
import { ACCEPT_ATTRIBUTE, checkStatementFile } from '../lib/statements'
import { useToast } from '../components/useToast'
import { applyFieldErrors, errorMessage, fieldAria } from '../lib/forms'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const NEW_PROVIDER = '__new__'

const schema = z.object({
  title: z.string().trim().min(1, 'Enter a title, for example “Electricity, March”.').max(160, 'Use at most 160 characters.'),
  providerId: z.string().min(1, 'Choose a provider.'),
  categoryId: z.string().min(1, 'Choose a category.'),
  amount: z.string().trim().min(1, 'Enter the amount.')
    .regex(/^\d{1,10}([.,]\d{1,2})?$/, 'Use a number with up to two decimals, like 84.20.'),
  dueDate: z.string().min(1, 'Choose the due date.'),
  reminderLeadDays: z.number({ error: 'Use a number of days from 0 to 60.' }).int('Use whole days.')
    .min(0, 'Use 0 to 60 days.').max(60, 'Use 0 to 60 days.'),
  notes: z.string().max(2000, 'Notes can be at most 2000 characters.'),
})

type FormValues = z.infer<typeof schema>
const FIELDS = ['title', 'providerId', 'categoryId', 'amount', 'dueDate', 'reminderLeadDays', 'notes'] as const

export function BillFormPage() {
  const { id } = useParams()
  return id ? <EditBill id={id} /> : <BillForm />
}

function EditBill({ id }: { id: string }) {
  const bill = useBill(id)
  if (bill.isPending) return <Loading label="Loading bill…" />
  if (bill.isError) return <ErrorNotice error={bill.error} onRetry={() => bill.refetch()} />
  return <BillForm existing={bill.data} onReload={() => bill.refetch()} />
}

function BillForm({ existing, onReload }: { existing?: BillDetail; onReload?: () => void }) {
  const household = useHousehold()
  const navigate = useNavigate()
  const toast = useToast()
  const invalidate = useInvalidateLedger()
  const providers = useProviders()
  const categories = useCategories()
  const [providerDialog, setProviderDialog] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | undefined>()
  const editing = Boolean(existing)
  useDocumentTitle(editing ? `Edit ${existing?.title}` : 'Add bill')

  const { register, handleSubmit, setValue, getValues, setError, reset, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: existing ? valuesFrom(existing) : {
        title: '',
        providerId: '',
        categoryId: '',
        amount: '',
        dueDate: household.today,
        reminderLeadDays: household.defaultReminderLeadDays,
        notes: '',
      },
    })

  useEffect(() => {
    if (existing) reset(valuesFrom(existing))
  }, [existing, reset])

  const symbol = moneyParts(0, household.currency)
  const providerField = register('providerId')

  function onProviderChange(providerId: string) {
    if (providerId === NEW_PROVIDER) {
      setProviderDialog(true)
      return
    }
    // Pre-select the provider's usual category unless the user already picked a different one.
    const previous = providers.data?.find((p) => p.id === getValues('providerId'))
    const next = providers.data?.find((p) => p.id === providerId)
    const category = getValues('categoryId')
    if (next?.defaultCategory && (!category || category === previous?.defaultCategory?.id)) {
      setValue('categoryId', next.defaultCategory.id, { shouldValidate: true })
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    setStale(false)
    const body: BillInput = {
      title: values.title.trim(),
      providerId: values.providerId,
      categoryId: values.categoryId,
      amount: values.amount.replace(',', '.'),
      dueDate: values.dueDate,
      reminderLeadDays: values.reminderLeadDays,
      notes: values.notes.trim() || null,
      version: existing?.version,
    }
    try {
      const saved = existing ? await billsApi.update(existing.id, body) : await billsApi.create(body)
      if (file) {
        try {
          await documentsApi.upload(saved.id, file)
        } catch (error) {
          toast.show(`Bill saved, but the statement upload failed: ${errorMessage(error)}`, { tone: 'error' })
        }
      }
      await invalidate()
      toast.show(existing ? 'Bill updated.' : 'Bill added.')
      navigate(`/bills/${saved.id}`)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'stale_update') {
        setStale(true)
        return
      }
      if (!applyFieldErrors(error, setError, FIELDS)) setFormError(errorMessage(error))
    }
  })

  if (providers.isPending || categories.isPending) return <Loading label="Loading providers and categories…" />
  if (providers.isError) return <ErrorNotice error={providers.error} onRetry={() => providers.refetch()} />
  if (categories.isError) return <ErrorNotice error={categories.error} onRetry={() => categories.refetch()} />

  return (
    <>
      <PageHeader
        eyebrow={editing ? 'Edit bill' : 'New bill'}
        title={editing ? existing!.title : 'Add a bill'}
        lede={editing ? undefined : 'Record a bill you need to pay. You can attach the statement now or later.'}
      >
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/bills">Bills</Link>
          {editing && <><span aria-hidden="true">/</span><Link to={`/bills/${existing!.id}`}>{existing!.title}</Link></>}
        </nav>
      </PageHeader>

      <div className="form-page">
        <form className="form" onSubmit={onSubmit} noValidate>
          {formError && <ErrorNotice error={new ApiError(400, 'form', formError)} title="The bill wasn't saved" />}
          {stale && (
            <div className="notice" role="alert">
              <Icon name="alert" />
              <div>
                <strong>This bill changed since you opened it</strong>
                <span>Someone (or another tab) saved a newer version. Reload it, then make your change again.</span>
                <div style={{ marginTop: '0.6rem' }}>
                  <button type="button" className="btn btn-secondary btn-small" onClick={onReload}>Reload bill</button>
                </div>
              </div>
            </div>
          )}

          <Field label="Title" htmlFor="title" error={errors.title?.message}>
            <input className="input" placeholder="Electricity, March" {...fieldAria('title', errors.title?.message)}
              {...register('title')} />
          </Field>

          <div className="form-grid">
            <Field label="Provider" htmlFor="providerId" error={errors.providerId?.message}>
              <select
                className="select"
                {...fieldAria('providerId', errors.providerId?.message)}
                {...providerField}
                onChange={(event) => {
                  onProviderChange(event.target.value)
                  if (event.target.value !== NEW_PROVIDER) void providerField.onChange(event)
                }}
              >
                <option value="">Choose a provider</option>
                {providers.data.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                <option value={NEW_PROVIDER}>+ Add a new provider…</option>
              </select>
            </Field>
            <Field label="Category" htmlFor="categoryId" error={errors.categoryId?.message}>
              <select className="select" {...fieldAria('categoryId', errors.categoryId?.message)} {...register('categoryId')}>
                <option value="">Choose a category</option>
                {categories.data.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </Field>
            <Field label="Amount" htmlFor="amount" error={errors.amount?.message}>
              <div className="input-affix">
                <span className="affix" aria-hidden="true">{symbol.prefix.trim() || household.currency}</span>
                <input className="input num" inputMode="decimal" autoComplete="off" placeholder="0.00"
                  {...fieldAria('amount', errors.amount?.message)} {...register('amount')} />
              </div>
            </Field>
            <Field label="Due date" htmlFor="dueDate" error={errors.dueDate?.message}>
              <input className="input" type="date" {...fieldAria('dueDate', errors.dueDate?.message)} {...register('dueDate')} />
            </Field>
            <Field label="Remind me" htmlFor="reminderLeadDays" error={errors.reminderLeadDays?.message}
              help="Days before the due date. 0 reminds you on the day.">
              <input className="input num" type="number" min={0} max={60} step={1}
                {...fieldAria('reminderLeadDays', errors.reminderLeadDays?.message, true)}
                {...register('reminderLeadDays', { valueAsNumber: true })} />
            </Field>
          </div>

          <Field label="Notes" htmlFor="notes" optional error={errors.notes?.message}>
            <textarea className="textarea" placeholder="Meter reading, account number, anything worth remembering"
              {...fieldAria('notes', errors.notes?.message)} {...register('notes')} />
          </Field>

          {!editing && (
            <Field label="Statement" htmlFor="statement" optional error={fileError}
              help="PDF, JPG or PNG up to 10 MB. Uploaded after the bill is saved.">
              <input className="input" type="file" accept={ACCEPT_ATTRIBUTE}
                {...fieldAria('statement', fileError, true)}
                onChange={(event) => {
                  const chosen = event.target.files?.[0] ?? null
                  const problem = chosen ? checkStatementFile(chosen) : null
                  setFileError(problem ?? undefined)
                  setFile(problem ? null : chosen)
                }} />
            </Field>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Add bill'}
            </button>
            <Link to={editing ? `/bills/${existing!.id}` : '/bills'} className="btn btn-secondary">Cancel</Link>
          </div>
        </form>

        <aside className="form-aside" aria-label="About bills">
          <h2>How bills work</h2>
          <p>A bill is unpaid until you mark it paid. Once its due date passes, it shows as overdue.</p>
          <p>
            Reminders appear in your notifications the chosen number of days before the due date, and again if the
            bill becomes overdue.
          </p>
          <p>Bills that arrive on a schedule are easier to set up once as a <Link to="/recurring/new">recurring bill</Link>.</p>
        </aside>
      </div>

      <ProviderQuickCreate
        open={providerDialog}
        onClose={() => setProviderDialog(false)}
        onCreated={(provider) => {
          setValue('providerId', provider.id, { shouldValidate: true })
          if (provider.defaultCategory && !getValues('categoryId')) {
            setValue('categoryId', provider.defaultCategory.id, { shouldValidate: true })
          }
        }}
      />
    </>
  )
}

function valuesFrom(bill: BillDetail): FormValues {
  return {
    title: bill.title,
    providerId: bill.provider.id,
    categoryId: bill.category.id,
    amount: bill.amount,
    dueDate: bill.dueDate,
    reminderLeadDays: bill.reminderLeadDays,
    notes: bill.notes ?? '',
  }
}
