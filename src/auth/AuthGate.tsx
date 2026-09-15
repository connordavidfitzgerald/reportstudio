import type { ReactNode } from 'react'
import {
  AuthScreen,
  ConfirmationScreen,
  NewPasswordScreen,
  UnconfiguredScreen,
} from './AuthScreen'
import { useAuth } from './useAuth'

/**
 * What the app shows before it knows who is using it.
 *
 * ## The splash does not flash
 *
 * Restoring a session usually means reading localStorage, which is instant, but
 * sometimes means a token refresh over the network, which is not. Rendering a
 * spinner for both gives everyone a flicker to pay for the slow case. Instead
 * the splash is painted immediately and faded in on a delay, so a fast restore
 * shows nothing at all and a slow one shows something honest.
 *
 * ## The `key` is load-bearing
 *
 * `useDeck` is a module-level store that outlives any unmount. Keying the
 * editor on the user id is what forces a fresh one per account: without it,
 * signing out and back in as somebody else leaves the previous user's report in
 * memory, `bootstrap()` never re-runs, and the first keystroke would save that
 * report into the new account — which row-level security permits, because the
 * new session owns the write.
 */

function Splash() {
  return (
    <div className="flex h-full items-center justify-center bg-ground">
      <span className="animate-[fadeIn_200ms_ease-out_250ms_both] text-2xs uppercase text-dim">
        Loading…
      </span>
    </div>
  )
}

export function AuthGate({ children }: { children: (userId: string) => ReactNode }) {
  const status = useAuth((s) => s.status)
  const user = useAuth((s) => s.user)

  switch (status) {
    case 'unconfigured':
      return <UnconfiguredScreen />
    case 'loading':
      return <Splash />
    case 'awaitingConfirmation':
      return <ConfirmationScreen />
    case 'recovery':
      return <NewPasswordScreen />
    case 'signedIn':
      // `user` is set alongside the status, but narrow rather than assert.
      return user ? <>{children(user.id)}</> : <Splash />
    default:
      return <AuthScreen />
  }
}
