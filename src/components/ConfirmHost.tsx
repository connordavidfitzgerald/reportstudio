import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ConfirmContext, type ConfirmFn, type ConfirmRequest } from '../hooks/useConfirm'
import { Button, Modal } from './ui'

/**
 * Holds the one confirmation dialog the app ever shows.
 *
 * One host rather than a dialog per call site: the question is always the same
 * shape, and a second one appearing on top of the first would be a bug rather
 * than a feature. A pending request keeps its `resolve` alongside it, so
 * dismissing by Escape or by the backdrop answers `false` exactly like Cancel.
 */
export function ConfirmHost({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>(
    (next) =>
      new Promise<boolean>((resolve) => {
        // A second question while one is open answers the first with "no",
        // rather than stranding a promise that never settles.
        resolver.current?.(false)
        resolver.current = resolve
        setRequest(next)
      }),
    [],
  )

  const answer = (ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setRequest(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <Modal title={request.title} onClose={() => answer(false)} width={420}>
          {request.body && <p className="text-[13px] leading-snug">{request.body}</p>}
          <div className="flex justify-end gap-2 border-t border-ink/25/15 pt-3">
            <Button variant="quiet" onClick={() => answer(false)}>
              Cancel
            </Button>
            <Button variant={request.danger ? 'danger' : 'primary'} onClick={() => answer(true)}>
              {request.confirmLabel ?? 'Continue'}
            </Button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}
