import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { z } from 'zod'

import { ApiError } from '../api/client'
import { schedulesApi } from '../api/endpoints'
import { useCategories, useInvalidateLedger, useProviders, useSchedule, useSchedules } from '../api/queries'
import type { Frequency, Schedule, ScheduleInput } from '../api/types'
import { ConfirmDialog } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { ProviderQuickCreate } from '../components/ProviderQuickCreate'
import {
  DueHint,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  MoneyFigure,
  PageHeader,
  StatusLabel,
} from '../components/ui'
import { FREQUENCY_LABEL, formatDate, formatWeekday, money, moneyParts, ordinal, plural } from '../lib/format'
import { useHousehold } from '../auth/useAuth'
import { useToast } from '../components/useToast'
import { applyFieldErrors, errorMessage, fieldAria } from '../lib/forms'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { useDocumentTitle } from '../lib/useDocumentTitle'

function cadence(schedule: Pick<Schedule, 'frequency' | 'billingDay'>): string {
  const day = schedule.billingDay >= 29
    ? `the ${ordinal(schedule.billingDay)} (or the month's last day)`
    : `the ${ordinal(schedule.billingDay)}`
  return `${FREQUENCY_LABEL[schedule.frequency]} on ${day}`
}

function ScheduleStatus({ active }: { active: boolean }) {
  return active ? (
    <span className="status status-active"><Icon name="repeat" size={12} />Active</span>
  ) : (
    <span className="status status-paused"><Icon name="pause" size={12} />Paused</span>
  )
}

function useScheduleToggle() {
  const invalidate = useInvalidateLedger()
  const toast = useToast()
  return useMutation({
    mutationFn: (schedule: Schedule) => (schedule.active ? schedulesApi.pause(schedule.id) : schedulesApi.resume(schedule.id)),
    onSuccess: async (detail) => {
      await invalidate()
      toast.show(detail.schedule.active
        ? `Resumed: ${detail.schedule.title}. Upcoming bills are being created.`
        : `Paused: ${detail.schedule.title}. No new bills will be created.`)
    },
    onError: (error) => toast.show(errorMessage(error), { tone: 'error' }),
  })
}

export function SchedulesPage() {
  useDocumentTitle('Recurring bills')
  const schedules = useSchedules()
  const toggle = useScheduleToggle()

  return (
    <>
      <PageHeader
        eyebrow="Ledger"
        title="Recurring bills"
        lede="Set a bill up once. PaperTrail creates each instance 30 days before it's due and reminds you ahead of the due date."
        actions={<Link to="/recurring/new" className="btn btn-primary"><Icon name="plus" />New recurring bill</Link>}
      />
      {schedules.isPending ? <Loading label="Loading schedules…" />
        : schedules.isError ? <ErrorNotice error={schedules.error} onRetry={() => schedules.refetch()} />
          : schedules.data.length === 0 ? (
            <EmptyState title="No recurring bills yet"
              action={<Link to="/recurring/new" className="btn btn-primary">Set up a recurring bill</Link>}>
              Rent, energy, broadband and insurance usually follow a pattern. Add each once and the monthly,
              quarterly or annual bills will appear by themselves.
            </EmptyState>
          ) : (
            <table className="ledger stack">
              <caption className="sr-only">Recurring bills</caption>
              <thead>
                <tr>
                  <th scope="col">Bill</th>
                  <th scope="col">Schedule</th>
                  <th scope="col" className="col-num">Amount</th>
                  <th scope="col">Next due</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="col-actions"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {schedules.data.map((schedule) => (
                  <tr key={schedule.id}>
                    <td className="cell-main">
                      <Link to={`/recurring/${schedule.id}`} className="primary-link">{schedule.title}</Link>
                      <span className="sub">{schedule.provider.name} · {schedule.category.name}</span>
                    </td>
                    <td className="cell-meta">
                      {cadence(schedule)}
                      <span className="due-hint">
                        {schedule.reminderLeadDays === 0 ? 'Reminder on the day'
                          : `Reminder ${plural(schedule.reminderLeadDays, 'day')} before`}
                      </span>
                    </td>
                    <td className="col-num cell-amount">{money(schedule.amount, schedule.currency)}</td>
                    <td className="col-date cell-meta" data-label="Next">
                      {schedule.active && schedule.upcoming[0] ? formatWeekday(schedule.upcoming[0]) : <span className="muted">–</span>}
                    </td>
                    <td className="cell-status"><ScheduleStatus active={schedule.active} /></td>
                    <td className="col-actions cell-actions">
                      <button type="button" className="btn btn-text" disabled={toggle.isPending}
                        onClick={() => toggle.mutate(schedule)}
                        aria-label={`${schedule.active ? 'Pause' : 'Resume'} ${schedule.title}`}>
                        {schedule.active ? 'Pause' : 'Resume'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
    </>
  )
}

export function ScheduleDetailPage() {
  const { id = '' } = useParams()
  const detail = useSchedule(id)
  const toggle = useScheduleToggle()
  const invalidate = useInvalidateLedger()
  const navigate = useNavigate()
  const toast = useToast()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const remove = useMutation({
    mutationFn: () => schedulesApi.remove(id),
    onSuccess: async () => {
      setDeleteOpen(false)
      toast.show('Recurring bill deleted. Bills it already created were kept.')
      navigate('/recurring')
      await invalidate()
    },
    onError: (error) => toast.show(errorMessage(error), { tone: 'error' }),
  })
  useDocumentTitle(detail.data?.schedule.title ?? 'Recurring bill')

  if (detail.isPending) return <Loading label="Loading schedule…" />
  if (detail.isError) {
    if (detail.error instanceof ApiError && detail.error.status === 404) {
      return (
        <EmptyState title="Recurring bill not found"
          action={<Link to="/recurring" className="btn btn-secondary">Back to recurring bills</Link>}>
          It may have been deleted.
        </EmptyState>
      )
    }
    return <ErrorNotice error={detail.error} onRetry={() => detail.refetch()} />
  }
  const { schedule, recentBills } = detail.data

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/recurring">Recurring bills</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{schedule.title}</span>
      </nav>
      <header className="bill-header">
        <div>
          <p className="eyebrow">{schedule.provider.name} · {schedule.category.name}</p>
          <h1>{schedule.title}</h1>
          <div className="bill-status-line">
            <ScheduleStatus active={schedule.active} />
            <span>{cadence(schedule)}</span>
          </div>
        </div>
        <p className="bill-amount"><MoneyFigure amount={schedule.amount} currency={schedule.currency} /></p>
        <div className="bill-actions btn-row">
          <Link to={`/recurring/${schedule.id}/edit`} className="btn btn-secondary">Edit</Link>
          <button type="button" className="btn btn-secondary" disabled={toggle.isPending} onClick={() => toggle.mutate(schedule)}>
            <Icon name={schedule.active ? 'pause' : 'play'} />
            {schedule.active ? 'Pause' : 'Resume'}
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setDeleteOpen(true)}>
            <Icon name="trash" />Delete
          </button>
        </div>
      </header>

      <div className="split collapse-md">
        <section className="span-7" aria-labelledby="generated-heading">
          <div className="section-head">
            <div>
              <h2 id="generated-heading">Bills from this schedule</h2>
              <p>{plural(schedule.generatedCount, 'bill')} created so far. Editing the schedule never changes these.</p>
            </div>
            <Link to={`/bills?schedule=${schedule.id}`} className="small">Open in bills</Link>
          </div>
          {recentBills.length === 0 ? (
            <p className="muted small">
              {schedule.active
                ? 'The first bill appears once its due date is within 30 days.'
                : 'Paused schedules create no bills.'}
            </p>
          ) : (
            <table className="ledger stack">
              <caption className="sr-only">Bills created by this schedule</caption>
              <thead>
                <tr>
                  <th scope="col">Due</th>
                  <th scope="col">Bill</th>
                  <th scope="col" className="col-num">Amount</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentBills.map((bill) => (
                  <tr key={bill.id}>
                    <td className="col-date cell-meta">
                      {formatDate(bill.dueDate)}
                      <DueHint status={bill.status} daysUntilDue={bill.daysUntilDue} paidDate={bill.paidDate} />
                    </td>
                    <td className="cell-main"><Link to={`/bills/${bill.id}`} className="primary-link">{bill.title}</Link></td>
                    <td className="col-num cell-amount">{money(bill.amount, bill.currency)}</td>
                    <td className="cell-status"><StatusLabel status={bill.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="span-5 divided-left" aria-labelledby="schedule-facts">
          <h2 id="schedule-facts" className="h3" style={{ marginBottom: '0.9rem' }}>Schedule</h2>
          <dl className="facts">
            <dt>Repeats</dt>
            <dd>{cadence(schedule)}</dd>
            <dt>Started</dt>
            <dd>{formatDate(schedule.startDate)}</dd>
            <dt>Next dates</dt>
            <dd>
              {schedule.active
                ? schedule.upcoming.map((date) => <span key={date} className="num" style={{ display: 'block' }}>{formatWeekday(date)} {date.slice(0, 4)}</span>)
                : <span className="muted">Paused</span>}
            </dd>
            <dt>Reminder</dt>
            <dd>{schedule.reminderLeadDays === 0 ? 'On the due date' : `${plural(schedule.reminderLeadDays, 'day')} before`}</dd>
            <dt>Last created</dt>
            <dd>{schedule.lastGenerated ? `Bill due ${formatDate(schedule.lastGenerated)}` : <span className="muted">None yet</span>}</dd>
            <dt>Notes</dt>
            <dd>{schedule.notes ?? <span className="muted">None</span>}</dd>
          </dl>
        </section>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this recurring bill?"
        confirmLabel="Delete schedule"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setDeleteOpen(false)}
      >
        <p>
          No more bills will be created for <strong>{schedule.title}</strong>. The {plural(schedule.generatedCount, 'bill')} it
          already created stay in your ledger. To stop it for a while instead, pause it.
        </p>
      </ConfirmDialog>
    </>
  )
}

const scheduleSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title, for example “Rent”.').max(160, 'Use at most 160 characters.'),
  providerId: z.string().min(1, 'Choose a provider.'),
  categoryId: z.string().min(1, 'Choose a category.'),
  amount: z.string().trim().min(1, 'Enter the usual amount.')
    .regex(/^\d{1,10}([.,]\d{1,2})?$/, 'Use a number with up to two decimals, like 49.99.'),
  frequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
  startDate: z.string().min(1, 'Choose when the schedule starts.'),
  billingDay: z.number({ error: 'Choose a day from 1 to 31.' }).int().min(1, 'Choose a day from 1 to 31.')
    .max(31, 'Choose a day from 1 to 31.'),
  reminderLeadDays: z.number({ error: 'Use 0 to 60 days.' }).int('Use whole days.').min(0, 'Use 0 to 60 days.')
    .max(60, 'Use 0 to 60 days.'),
  active: z.boolean(),
  notes: z.string().max(2000, 'Notes can be at most 2000 characters.'),
})

type ScheduleFormValues = z.infer<typeof scheduleSchema>
const SCHEDULE_FIELDS = ['title', 'providerId', 'categoryId', 'amount', 'frequency', 'startDate', 'billingDay',
  'reminderLeadDays', 'notes'] as const

export function ScheduleFormPage() {
  const { id } = useParams()
  const detail = useQuery({ queryKey: ['schedules', id], queryFn: () => schedulesApi.get(id!), enabled: Boolean(id) })
  if (!id) return <ScheduleForm />
  if (detail.isPending) return <Loading label="Loading schedule…" />
  if (detail.isError) return <ErrorNotice error={detail.error} onRetry={() => detail.refetch()} />
  return <ScheduleForm existing={detail.data.schedule} />
}

function ScheduleForm({ existing }: { existing?: Schedule }) {
  const household = useHousehold()
  const navigate = useNavigate()
  const toast = useToast()
  const invalidate = useInvalidateLedger()
  const providers = useProviders()
  const categories = useCategories()
  const [providerDialog, setProviderDialog] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  useDocumentTitle(existing ? `Edit ${existing.title}` : 'New recurring bill')

  const { register, handleSubmit, control, setValue, getValues, setError, formState: { errors, isSubmitting } } =
    useForm<ScheduleFormValues>({
      resolver: zodResolver(scheduleSchema),
      defaultValues: existing ? {
        title: existing.title,
        providerId: existing.provider.id,
        categoryId: existing.category.id,
        amount: existing.amount,
        frequency: existing.frequency,
        startDate: existing.startDate,
        billingDay: existing.billingDay,
        reminderLeadDays: existing.reminderLeadDays,
        active: existing.active,
        notes: existing.notes ?? '',
      } : {
        title: '',
        providerId: '',
        categoryId: '',
        amount: '',
        frequency: 'MONTHLY',
        startDate: household.today,
        billingDay: Number(household.today.slice(8, 10)),
        reminderLeadDays: household.defaultReminderLeadDays,
        active: true,
        notes: '',
      },
    })

  // Live preview of the dates this schedule will produce (computed by the API, same rules as the job).
  const [startDate, billingDay, frequency] = useWatch({ control, name: ['startDate', 'billingDay', 'frequency'] })
  // Debounce a primitive key: a fresh object each render would never settle.
  const previewKey = useDebouncedValue(
    `${startDate ?? ''}|${Number.isFinite(billingDay) ? billingDay : ''}|${frequency}`, 250)
  const [previewStart, previewDayText, previewFrequency] = previewKey.split('|')
  const previewDay = Number(previewDayText)
  const previewValid = Boolean(previewStart) && previewDay >= 1 && previewDay <= 31
  const previewQuery = useQuery({
    queryKey: ['schedule-preview', previewKey],
    queryFn: () => schedulesApi.preview({
      startDate: previewStart,
      billingDay: previewDay,
      frequency: previewFrequency,
      count: 6,
    }),
    enabled: previewValid,
    placeholderData: keepPreviousData,
  })
  const preview = previewValid ? previewQuery.data?.dates ?? null : null

  const providerField = register('providerId')

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    const body: ScheduleInput = {
      ...values,
      amount: values.amount.replace(',', '.'),
      notes: values.notes.trim() || null,
      version: existing?.version,
    }
    try {
      const saved = existing ? await schedulesApi.update(existing.id, body) : await schedulesApi.create(body)
      await invalidate()
      toast.show(existing ? 'Recurring bill updated. Changes apply to bills created from now on.'
        : 'Recurring bill added.')
      navigate(`/recurring/${saved.schedule.id}`)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'stale_update') {
        setFormError('This schedule changed since you opened it. Reload the page and try again.')
        return
      }
      if (!applyFieldErrors(error, setError, SCHEDULE_FIELDS)) setFormError(errorMessage(error))
    }
  })

  if (providers.isPending || categories.isPending) return <Loading label="Loading providers and categories…" />
  if (providers.isError) return <ErrorNotice error={providers.error} onRetry={() => providers.refetch()} />
  if (categories.isError) return <ErrorNotice error={categories.error} onRetry={() => categories.refetch()} />

  const symbol = moneyParts(0, household.currency).prefix.trim() || household.currency

  return (
    <>
      <PageHeader eyebrow={existing ? 'Edit recurring bill' : 'New recurring bill'}
        title={existing ? existing.title : 'Set up a recurring bill'}>
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/recurring">Recurring bills</Link>
          {existing && <><span aria-hidden="true">/</span><Link to={`/recurring/${existing.id}`}>{existing.title}</Link></>}
        </nav>
      </PageHeader>

      <div className="form-page">
        <form className="form" onSubmit={onSubmit} noValidate>
          {formError && <ErrorNotice error={new ApiError(400, 'form', formError)} title="The schedule wasn't saved" />}
          {existing && (
            <div className="notice info">
              <Icon name="repeat" />
              <span>Changes apply to bills created from now on. Bills already in your ledger keep their amounts and dates.</span>
            </div>
          )}
          <Field label="Title" htmlFor="title" error={errors.title?.message}>
            <input className="input" placeholder="Rent" {...fieldAria('title', errors.title?.message)} {...register('title')} />
          </Field>
          <div className="form-grid">
            <Field label="Provider" htmlFor="providerId" error={errors.providerId?.message}>
              <select className="select" {...fieldAria('providerId', errors.providerId?.message)} {...providerField}
                onChange={(event) => {
                  if (event.target.value === '__new__') {
                    setProviderDialog(true)
                    return
                  }
                  const provider = providers.data.find((p) => p.id === event.target.value)
                  if (provider?.defaultCategory && !getValues('categoryId')) {
                    setValue('categoryId', provider.defaultCategory.id, { shouldValidate: true })
                  }
                  void providerField.onChange(event)
                }}>
                <option value="">Choose a provider</option>
                {providers.data.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                <option value="__new__">+ Add a new provider…</option>
              </select>
            </Field>
            <Field label="Category" htmlFor="categoryId" error={errors.categoryId?.message}>
              <select className="select" {...fieldAria('categoryId', errors.categoryId?.message)} {...register('categoryId')}>
                <option value="">Choose a category</option>
                {categories.data.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </Field>
            <Field label="Usual amount" htmlFor="amount" error={errors.amount?.message}
              help="Copied onto each new bill; adjust a bill when its statement arrives.">
              <div className="input-affix">
                <span className="affix" aria-hidden="true">{symbol}</span>
                <input className="input num" inputMode="decimal" placeholder="0.00"
                  {...fieldAria('amount', errors.amount?.message, true)} {...register('amount')} />
              </div>
            </Field>
            <Field label="Repeats" htmlFor="frequency" error={errors.frequency?.message}>
              <select className="select" {...fieldAria('frequency', errors.frequency?.message)} {...register('frequency')}>
                {(['MONTHLY', 'QUARTERLY', 'ANNUAL'] as Frequency[]).map((value) => (
                  <option key={value} value={value}>{FREQUENCY_LABEL[value]}</option>
                ))}
              </select>
            </Field>
            <Field label="Starts on" htmlFor="startDate" error={errors.startDate?.message}
              help="The first bill falls on the first billing day on or after this date.">
              <input className="input" type="date" {...fieldAria('startDate', errors.startDate?.message, true)} {...register('startDate')} />
            </Field>
            <Field label="Billing day" htmlFor="billingDay" error={errors.billingDay?.message}
              help="Day 29–31 uses the last day of shorter months, then returns.">
              <input className="input num" type="number" min={1} max={31}
                {...fieldAria('billingDay', errors.billingDay?.message, true)} {...register('billingDay', { valueAsNumber: true })} />
            </Field>
            <Field label="Remind me" htmlFor="reminderLeadDays" error={errors.reminderLeadDays?.message}
              help="Days before each due date.">
              <input className="input num" type="number" min={0} max={60}
                {...fieldAria('reminderLeadDays', errors.reminderLeadDays?.message, true)}
                {...register('reminderLeadDays', { valueAsNumber: true })} />
            </Field>
            <div className="field" style={{ alignSelf: 'end', paddingBottom: '0.6rem' }}>
              <label className="checkbox">
                <input type="checkbox" {...register('active')} />
                Active: create upcoming bills automatically
              </label>
            </div>
          </div>
          <Field label="Notes" htmlFor="notes" optional error={errors.notes?.message}>
            <textarea className="textarea" {...fieldAria('notes', errors.notes?.message)} {...register('notes')} />
          </Field>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : existing ? 'Save changes' : 'Add recurring bill'}
            </button>
            <Link to={existing ? `/recurring/${existing.id}` : '/recurring'} className="btn btn-secondary">Cancel</Link>
          </div>
        </form>

        <aside className="form-aside" aria-label="Upcoming dates">
          <h2>Next due dates</h2>
          <p>Bills are created 30 days ahead of these dates, with a reminder before each one.</p>
          {preview && preview.length > 0 ? (
            <ol className="preview-dates" aria-live="polite">
              {preview.map((date) => {
                const clamped = billingDay > Number(date.slice(8, 10))
                return (
                  <li key={date}>
                    <span>{formatWeekday(date)} {date.slice(0, 4)}</span>
                    {clamped && <span className="muted">month&rsquo;s last day</span>}
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="muted">Choose a start date and billing day to see the dates.</p>
          )}
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
