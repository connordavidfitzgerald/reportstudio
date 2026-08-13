import { createContext, useContext } from 'react'

/**
 * Asking before something destructive, in the app's own voice.
 *
 * `window.confirm` was doing this job and doing it badly: it is the browser's
 * chrome rather than the tool's, it says "localhost:5173 says", it can't be
 * styled, and on some setups it can be suppressed entirely — which would mean a
 * page silently replaced with no warning at all.
 *
 * The shape is a promise so the call sites keep reading like the `confirm` they
 * replaced:
 *
 * ```ts
 * if (!(await confirm({ title: 'Delete page 4?' }))) return
 * ```
 */

export interface ConfirmRequest {
  title: string
  /** The consequence, in a sentence. */
  body?: string
  /** Label for the affirmative button. Defaults to "Continue". */
  confirmLabel?: string
  /** Style the affirmative button as destructive. */
  danger?: boolean
}

export type ConfirmFn = (request: ConfirmRequest) => Promise<boolean>

export const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext)
  if (!fn) throw new Error('useConfirm needs a <ConfirmHost> above it')
  return fn
}
