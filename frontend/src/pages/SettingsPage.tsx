import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { ApiError } from '../api/client'
import { accountApi } from '../api/endpoints'
import { useInvalidateLedger } from '../api/queries'
import { ErrorNotice, Field, PageHeader } from '../components/ui'
import { CURRENCIES, timezones } from '../lib/options'
import { useAuth, useHousehold } from '../auth/useAuth'
import { useToast } from '../components/useToast'
import { applyFieldErrors, errorMessage, fieldAria } from '../lib/forms'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const accountSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter a household name.').max(80, 'Use at most 80 characters.'),
  timezone: z.string().min(1, 'Choose a timezone.'),
  currency: z.string().length(3, 'Choose a currency.'),
  defaultReminderLeadDays: z.number({ error: 'Use 0 to 60 days.' }).int('Use whole days.')
    .min(0, 'Use 0 to 60 days.').max(60, 'Use 0 to 60 days.'),
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: z.string().min(8, 'Use at least 8 characters.').max(72, 'Use at most 72 characters.'),
  confirmPassword: z.string().min(1, 'Repeat the new password.'),
}).refine((values) => values.newPassword === values.confirmPassword, {
  message: "The passwords don't match.",
  path: ['confirmPassword'],
})

export function SettingsPage() {
  useDocumentTitle('Settings')
  const { logout } = useAuth()
  return (
    <>
      <PageHeader eyebrow="Household" title="Settings" />
      <AccountSection />
      <PasswordSection />
      <section className="settings-section" aria-labelledby="session-heading">
        <header>
          <h2 id="session-heading">Session</h2>
          <p>Signing out ends this browser&rsquo;s session. Other devices stay signed in.</p>
        </header>
        <div>
          <button type="button" className="btn btn-secondary" onClick={() => void logout()}>Sign out</button>
        </div>
      </section>
    </>
  )
}

function AccountSection() {
  const household = useHousehold()
  const { setAccount } = useAuth()
  const toast = useToast()
  const invalidate = useInvalidateLedger()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting, isDirty }, reset } = useForm({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      displayName: household.displayName,
      timezone: household.timezone,
      currency: household.currency,
      defaultReminderLeadDays: household.defaultReminderLeadDays,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      const updated = await accountApi.update(values)
      setAccount(updated)
      reset({
        displayName: updated.displayName,
        timezone: updated.timezone,
        currency: updated.currency,
        defaultReminderLeadDays: updated.defaultReminderLeadDays,
      })
      // A timezone change can move "today", and with it overdue status and every date-based figure.
      await invalidate()
      toast.show('Settings saved.')
    } catch (error) {
      if (!applyFieldErrors(error, setError, ['displayName', 'timezone', 'currency', 'defaultReminderLeadDays'])) {
        setFormError(errorMessage(error))
      }
    }
  })

  return (
    <section className="settings-section" aria-labelledby="account-heading">
      <header>
        <h2 id="account-heading">Household</h2>
        <p>Your timezone decides when a bill becomes overdue and when reminders are sent.</p>
      </header>
      <form className="form" onSubmit={onSubmit} noValidate>
        {formError && <ErrorNotice error={new ApiError(400, 'form', formError)} title="Settings weren't saved" />}
        <Field label="Email" htmlFor="email" help="Used to sign in.">
          <input className="input" value={household.email} disabled {...fieldAria('email', undefined, true)} />
        </Field>
        <Field label="Household name" htmlFor="displayName" error={errors.displayName?.message}>
          <input className="input" {...fieldAria('displayName', errors.displayName?.message)} {...register('displayName')} />
        </Field>
        <div className="form-grid">
          <Field label="Timezone" htmlFor="timezone" error={errors.timezone?.message}>
            <select className="select" {...fieldAria('timezone', errors.timezone?.message)} {...register('timezone')}>
              {timezones().map((zone) => <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Currency" htmlFor="currency" error={errors.currency?.message}
            help={household.currencyLocked
              ? 'Fixed once bills exist, so totals never mix currencies.'
              : 'Every bill uses this currency.'}>
            <select className="select" disabled={household.currencyLocked}
              {...fieldAria('currency', errors.currency?.message, true)} {...register('currency')}>
              {CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.label}</option>)}
            </select>
          </Field>
          <Field label="Default reminder" htmlFor="defaultReminderLeadDays" error={errors.defaultReminderLeadDays?.message}
            help="Days before the due date, for new one-off bills.">
            <input className="input num" type="number" min={0} max={60}
              {...fieldAria('defaultReminderLeadDays', errors.defaultReminderLeadDays?.message, true)}
              {...register('defaultReminderLeadDays', { valueAsNumber: true })} />
          </Field>
        </div>
        <div>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </section>
  )
}

function PasswordSection() {
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setFormError(null)
    try {
      await accountApi.changePassword({ currentPassword, newPassword })
      reset()
      toast.show('Password changed. Other devices have been signed out.')
    } catch (error) {
      if (!applyFieldErrors(error, setError, ['currentPassword', 'newPassword'])) setFormError(errorMessage(error))
    }
  })

  return (
    <section className="settings-section" aria-labelledby="password-heading">
      <header>
        <h2 id="password-heading">Password</h2>
        <p>Changing it signs out every other device. This browser stays signed in.</p>
      </header>
      <form className="form" onSubmit={onSubmit} noValidate>
        {formError && <ErrorNotice error={new ApiError(400, 'form', formError)} title="Password not changed" />}
        <Field label="Current password" htmlFor="currentPassword" error={errors.currentPassword?.message}>
          <input className="input" type="password" autoComplete="current-password"
            {...fieldAria('currentPassword', errors.currentPassword?.message)} {...register('currentPassword')} />
        </Field>
        <div className="form-grid">
          <Field label="New password" htmlFor="newPassword" error={errors.newPassword?.message} help="At least 8 characters.">
            <input className="input" type="password" autoComplete="new-password"
              {...fieldAria('newPassword', errors.newPassword?.message, true)} {...register('newPassword')} />
          </Field>
          <Field label="Repeat new password" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
            <input className="input" type="password" autoComplete="new-password"
              {...fieldAria('confirmPassword', errors.confirmPassword?.message)} {...register('confirmPassword')} />
          </Field>
        </div>
        <div>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </form>
    </section>
  )
}
