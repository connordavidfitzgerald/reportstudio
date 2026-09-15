import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { isConfigured, supabase } from './client'

/**
 * Who is signed in.
 *
 * ## The subscription is at module scope, not in an effect
 *
 * A password-reset link comes back to `/` carrying a single-use PKCE code, and
 * the client exchanges it for a session as soon as it is constructed. React's
 * StrictMode double-invokes effects in development, so subscribing from a
 * `useEffect` would run that exchange twice — the second one failing, because
 * the code is spent, and manufacturing a sign-in error that exists only in dev
 * and only on that one path. Subscribing once when the module loads avoids the
 * whole category.
 */

export type AuthStatus =
  | 'loading'
  | 'unconfigured'
  | 'signedOut'
  /** Signed up, but the confirmation link hasn't been followed yet. */
  | 'awaitingConfirmation'
  /** Arrived from a reset link and owes us a new password. */
  | 'recovery'
  | 'signedIn'

interface AuthState {
  status: AuthStatus
  user: User | null
  /** The last thing that went wrong, for the sign-in form to show. */
  error: string | null
  /** The address a confirmation mail was just sent to. */
  pendingEmail: string | null

  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  sendReset: (email: string) => Promise<boolean>
  setPassword: (password: string) => Promise<boolean>
  clearError: () => void
  dismissConfirmation: () => void
}

/** Supabase's messages are decent but not all of them are meant for a person. */
const readable = (message: string): string => {
  if (/invalid login credentials/i.test(message)) return 'That email and password do not match.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email address first — check your inbox.'
  if (/user already registered/i.test(message)) return 'There is already an account with that email. Try signing in.'
  if (/password should be at least/i.test(message)) return 'Use a password of at least six characters.'
  if (/failed to fetch|network/i.test(message)) return 'Could not reach the server. Check your connection.'
  return message
}

export const useAuth = create<AuthState>((set, get) => ({
  status: isConfigured() ? 'loading' : 'unconfigured',
  user: null,
  error: null,
  pendingEmail: null,

  signIn: async (email, password) => {
    set({ error: null })
    const { error } = await supabase().auth.signInWithPassword({ email, password })
    // On success `onAuthStateChange` sets the session; nothing to do here.
    if (error) set({ error: readable(error.message) })
  },

  signUp: async (email, password) => {
    set({ error: null })
    const { data, error } = await supabase().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      set({ error: readable(error.message) })
      return
    }
    // With email confirmation on, `signUp` returns a user but no session. Say
    // so plainly — otherwise the form looks like it silently did nothing.
    if (!data.session) set({ status: 'awaitingConfirmation', pendingEmail: email })
  },

  signOut: async () => {
    await supabase().auth.signOut()
    set({ status: 'signedOut', user: null, error: null })
  },

  sendReset: async (email) => {
    set({ error: null })
    const { error } = await supabase().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) {
      set({ error: readable(error.message) })
      return false
    }
    return true
  },

  setPassword: async (password) => {
    set({ error: null })
    const { error } = await supabase().auth.updateUser({ password })
    if (error) {
      set({ error: readable(error.message) })
      return false
    }
    // The recovery session is a real session, so this lands in the editor.
    set({ status: get().user ? 'signedIn' : 'signedOut' })
    return true
  },

  clearError: () => set({ error: null }),
  dismissConfirmation: () => set({ status: 'signedOut', pendingEmail: null }),
}))

// ---------------------------------------------------------------------------
// The subscription
// ---------------------------------------------------------------------------

if (isConfigured()) {
  const client = supabase()

  client.auth.getSession().then(({ data }) => {
    // Only settle `loading` if nothing has moved us on already — a recovery
    // link resolves through `onAuthStateChange` and must not be overwritten.
    if (useAuth.getState().status !== 'loading') return
    useAuth.setState(
      data.session
        ? { status: 'signedIn', user: data.session.user }
        : { status: 'signedOut', user: null },
    )
  })

  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      // The spent code is still in the address bar. Scrub it, or a reload
      // tries to redeem it again and fails.
      history.replaceState(null, '', window.location.pathname)
      useAuth.setState({ status: 'recovery', user: session?.user ?? null })
      return
    }

    if (event === 'SIGNED_OUT' || !session) {
      // Don't yank someone out of the new-password form: that flow holds a
      // session but hasn't finished yet.
      if (useAuth.getState().status === 'recovery') return
      useAuth.setState({ status: 'signedOut', user: null })
      return
    }

    if (useAuth.getState().status === 'recovery') {
      useAuth.setState({ user: session.user })
      return
    }
    useAuth.setState({ status: 'signedIn', user: session.user, error: null })
  })
}
