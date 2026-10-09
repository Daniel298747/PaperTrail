import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation } from 'react-router'
import { z } from 'zod'

import type { AuthRedirectState } from '../auth/guards'
import { Icon } from '../components/Icon'
import { Field } from '../components/ui'
import { CURRENCIES, browserTimezone, timezones } from '../lib/options'
import { useAuth } from '../auth/useAuth'
import { applyFieldErrors, errorMessage, fieldAria } from '../lib/forms'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'
const SHOW_DEMO_HINT = !DEMO_MODE && (import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_HINT === 'true')
const DEMO_EMAIL = 'demo@papertrail.local'
const DEMO_PASSWORD = 'paper-trail-demo'

/** Static demo build: one click into the seeded household, or sign up for an empty one. */
function DemoWelcome({ onExplore, busy }: { onExplore: () => void; busy: boolean }) {
  return (
    <div className="demo-welcome">
      <p>
        <strong>Live demo.</strong> This copy of PaperTrail runs entirely in your browser: the API, a year of
        bills and every statement are simulated on this device, and nothing is sent anywhere.
      </p>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={onExplore}>
        {busy ? 'Opening…' : 'Explore the demo household'}
      </button>
      <p className="demo-hint">
        Or sign in below as <code>{DEMO_EMAIL}</code> / <code>{DEMO_PASSWORD}</code>, or create your own household.
      </p>
    </div>
  )
}

function AuthIntro() {
  return (
    <section className="auth-intro" aria-label="About PaperTrail">
      <div>
        <span className="wordmark" aria-hidden="true">Paper<em>Trail</em></span>
        <p className="auth-lede">A household ledger for the bills that arrive each month, and the paper they arrive on.</p>
      </div>
      <ol className="auth-points">
        <li><span className="point-no">01</span><span>See what is due this week, what is overdue and what has been paid.</span></li>
        <li><span className="point-no">02</span><span>Keep every statement, including the ones a corrected bill replaced.</span></li>
        <li><span className="point-no">03</span><span>Set recurring bills once; each month&rsquo;s bill and reminder appear on their own.</span></li>
        <li><span className="point-no">04</span><span>Follow monthly totals by provider and category.</span></li>
      </ol>
    </section>
  )
}

function FormNotice({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="notice" role="alert">
      <Icon name="alert" />
      <span>{message}</span>
    </div>
  )
}

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

export function LoginPage() {
  useDocumentTitle('Sign in')
  const { login } = useAuth()
  const redirect = useLocation().state as AuthRedirectState | null
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login(values.email, values.password)
    } catch (error) {
      if (!applyFieldErrors(error, setError, ['email', 'password'])) setFormError(errorMessage(error))
    }
  })

  const [exploring, setExploring] = useState(false)
  const explore = async () => {
    setFormError(null)
    setExploring(true)
    try {
      await login(DEMO_EMAIL, DEMO_PASSWORD)
    } catch (error) {
      setFormError(errorMessage(error))
      setExploring(false)
    }
  }

  return (
    <div className="auth">
      <AuthIntro />
      <main className="auth-form" id="main">
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in</h1>
        {redirect?.reason === 'expired' && (
          <div className="notice info" role="status" style={{ marginTop: '1rem' }}>
            <Icon name="clock" />
            <span>Your session expired. Sign in again to pick up where you left off.</span>
          </div>
        )}
        {DEMO_MODE && <DemoWelcome onExplore={() => void explore()} busy={exploring} />}
        <form className="form" onSubmit={onSubmit} noValidate>
          <FormNotice message={formError} />
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <input className="input" type="email" autoComplete="email" {...fieldAria('email', errors.email?.message)}
              {...register('email')} />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password?.message}>
            <input className="input" type="password" autoComplete="current-password"
              {...fieldAria('password', errors.password?.message)} {...register('password')} />
          </Field>
          <div>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
        <p className="auth-switch">
          New to PaperTrail? <Link to="/register">Create a household account</Link>
        </p>
        {SHOW_DEMO_HINT && (
          <p className="demo-hint">
            Demo household (after running the seed command): <code>demo@papertrail.local</code> /{' '}
            <code>paper-trail-demo</code>
          </p>
        )}
      </main>
    </div>
  )
}

const registerSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter a name for your household.').max(80, 'Use at most 80 characters.'),
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(72, 'Use at most 72 characters.'),
  confirmPassword: z.string().min(1, 'Repeat the password.'),
  timezone: z.string().min(1, 'Choose your timezone.'),
  currency: z.string().length(3, 'Choose a currency.'),
}).refine((values) => values.password === values.confirmPassword, {
  message: "The passwords don't match.",
  path: ['confirmPassword'],
})

export function RegisterPage() {
  useDocumentTitle('Create account')
  const { register: createAccount } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
      timezone: browserTimezone(),
      currency: 'EUR',
    },
  })

  const onSubmit = handleSubmit(async ({ confirmPassword: _confirm, ...values }) => {
    setFormError(null)
    try {
      await createAccount(values)
    } catch (error) {
      if (!applyFieldErrors(error, setError, ['displayName', 'email', 'password', 'timezone', 'currency'])) {
        setFormError(errorMessage(error))
      }
    }
  })

  return (
    <div className="auth">
      <AuthIntro />
      <main className="auth-form" id="main">
        <p className="eyebrow">New household</p>
        <h1>Create your account</h1>
        <p className="secondary">One account holds one household&rsquo;s bills, statements and reminders.</p>
        <form className="form" onSubmit={onSubmit} noValidate>
          <FormNotice message={formError} />
          <Field label="Household name" htmlFor="displayName" error={errors.displayName?.message}
            help="Shown in the sidebar, for example “The Byrne household”.">
            <input className="input" autoComplete="organization"
              {...fieldAria('displayName', errors.displayName?.message, true)} {...register('displayName')} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <input className="input" type="email" autoComplete="email" {...fieldAria('email', errors.email?.message)}
              {...register('email')} />
          </Field>
          <div className="form-grid">
            <Field label="Password" htmlFor="password" error={errors.password?.message} help="At least 8 characters.">
              <input className="input" type="password" autoComplete="new-password"
                {...fieldAria('password', errors.password?.message, true)} {...register('password')} />
            </Field>
            <Field label="Repeat password" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
              <input className="input" type="password" autoComplete="new-password"
                {...fieldAria('confirmPassword', errors.confirmPassword?.message)} {...register('confirmPassword')} />
            </Field>
            <Field label="Timezone" htmlFor="timezone" error={errors.timezone?.message}
              help="Decides when bills become overdue.">
              <select className="select" {...fieldAria('timezone', errors.timezone?.message, true)} {...register('timezone')}>
                {timezones().map((zone) => <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>)}
              </select>
            </Field>
            <Field label="Currency" htmlFor="currency" error={errors.currency?.message}
              help="One currency per household.">
              <select className="select" {...fieldAria('currency', errors.currency?.message, true)} {...register('currency')}>
                {CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.label}</option>)}
              </select>
            </Field>
          </div>
          <div>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </button>
          </div>
        </form>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </main>
    </div>
  )
}
