import { useState, type FormEvent, type ReactNode } from 'react'
import { Button, Card } from '../components/ui'
import { useAuth } from './useAuth'

/**
 * Signing in.
 *
 * One card on the same light ground the editor uses, so arriving here doesn't
 * feel like a different product. Three modes share the frame — sign in, create
 * an account, and forgot-password — because they are the same two fields and
 * swapping the whole screen for a second field would be theatre.
 *
 * `TextField` in `components/ui.tsx` is not reused: it has no password type, no
 * autocomplete hints and no submit behaviour, and a sign-in form that browsers
 * can't autofill is a worse form. The class string is copied from it so the
 * inputs still look like the rest of the app.
 */

const inputClass =
  'w-full rounded-2xl bg-control px-[15px] py-2 text-xs leading-normal text-ink outline-none ' +
  'placeholder:text-dim focus:ring-1 focus:ring-ink/40'

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <div className="pb-1.5 text-2xs uppercase leading-none text-dim">{label}</div>
      <input {...props} className={inputClass} />
    </label>
  )
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center bg-ground p-5">
      <Card className="w-full max-w-[360px] p-6">
        <h1 className="pb-4 text-lg leading-none text-ink">{title}</h1>
        {children}
      </Card>
    </div>
  )
}

type Mode = 'signIn' | 'signUp' | 'forgot'

const TITLES: Record<Mode, string> = {
  signIn: 'Sign in',
  signUp: 'Create an account',
  forgot: 'Reset your password',
}

export function AuthScreen() {
  const { error, signIn, signUp, sendReset, clearError } = useAuth()
  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const go = (next: Mode) => {
    clearError()
    setSent(false)
    setMode(next)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    if (mode === 'signIn') await signIn(email, password)
    else if (mode === 'signUp') await signUp(email, password)
    else setSent(await sendReset(email))
    setBusy(false)
  }

  if (mode === 'forgot' && sent) {
    return (
      <Frame title="Check your email">
        <p className="text-xs leading-snug text-dim">
          If there is an account for <span className="text-ink">{email}</span>, a link to choose a
          new password is on its way. The link opens this page.
        </p>
        <Button className="mt-4" onClick={() => go('signIn')}>
          Back to sign in
        </Button>
      </Frame>
    )
  }

  return (
    <Frame title={TITLES[mode]}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Field
          label="Email"
          type="email"
          value={email}
          required
          autoComplete="email"
          autoFocus
          onChange={(e) => setEmail(e.target.value)}
        />

        {mode !== 'forgot' && (
          <Field
            label="Password"
            type="password"
            value={password}
            required
            minLength={6}
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}

        {error && (
          <p className="border border-danger px-2 py-1.5 text-[11px] text-danger">{error}</p>
        )}

        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'One moment…' : TITLES[mode]}
        </Button>
      </form>

      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-4 text-[11px] text-dim">
        {mode !== 'signIn' && (
          <button type="button" className="hover:text-ink" onClick={() => go('signIn')}>
            Sign in
          </button>
        )}
        {mode !== 'signUp' && (
          <button type="button" className="hover:text-ink" onClick={() => go('signUp')}>
            Create an account
          </button>
        )}
        {mode !== 'forgot' && (
          <button type="button" className="hover:text-ink" onClick={() => go('forgot')}>
            Forgot your password?
          </button>
        )}
      </div>
    </Frame>
  )
}

/** After a reset link: the session exists, but the password is still the old one. */
export function NewPasswordScreen() {
  const { error, setPassword } = useAuth()
  const [password, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <Frame title="Choose a new password">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault()
          if (busy) return
          setBusy(true)
          await setPassword(password)
          setBusy(false)
        }}
      >
        <Field
          label="New password"
          type="password"
          value={password}
          required
          minLength={6}
          autoFocus
          autoComplete="new-password"
          onChange={(e) => setValue(e.target.value)}
        />
        {error && (
          <p className="border border-danger px-2 py-1.5 text-[11px] text-danger">{error}</p>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save and continue'}
        </Button>
      </form>
    </Frame>
  )
}

export function ConfirmationScreen() {
  const { pendingEmail, dismissConfirmation } = useAuth()
  return (
    <Frame title="Confirm your email">
      <p className="text-xs leading-snug text-dim">
        A confirmation link is on its way to{' '}
        <span className="text-ink">{pendingEmail ?? 'your inbox'}</span>. Follow it and you will be
        signed in — your reports are tied to that address.
      </p>
      <Button className="mt-4" onClick={dismissConfirmation}>
        Back to sign in
      </Button>
    </Frame>
  )
}

export function UnconfiguredScreen() {
  return (
    <Frame title="Not configured">
      <p className="text-xs leading-snug text-dim">
        This build has no Supabase credentials. Copy{' '}
        <span className="text-ink">.env.example</span> to{' '}
        <span className="text-ink">.env.local</span>, fill in the project URL and anon key, then
        restart the dev server.
      </p>
    </Frame>
  )
}
