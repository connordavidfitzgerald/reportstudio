import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { importLocalWork, markNever, pendingLocalWork } from '../store/localImport'
import type { LocalDocument } from '../store/localLibrary'
import { Button, Modal } from './ui'

/**
 * The offer to carry pre-account work into an account.
 *
 * This asks rather than acting. The reports in this browser were made before
 * anyone could sign in, so there is nothing tying them to the person signed in
 * now — on a shared machine they may be a colleague's, and copying somebody
 * else's work into your account is not undoable from inside the app.
 *
 * It is also the only place that mentions the old storage, which is why it says
 * plainly that the local copies are kept.
 */
export function LocalImportDialog({ onImported }: { onImported: () => void }) {
  const userId = useAuth((s) => s.user?.id ?? null)
  const email = useAuth((s) => s.user?.email ?? null)
  const [pending, setPending] = useState<LocalDocument[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(0)

  useEffect(() => {
    if (!userId) return
    void pendingLocalWork(userId).then(setPending)
  }, [userId])

  if (!userId || !pending?.length) return null

  const close = () => setPending([])

  const onAdd = async () => {
    setBusy(true)
    const { failed: n } = await importLocalWork(userId, pending)
    setBusy(false)
    if (n) {
      // Leave the dialog up: the remaining documents are still here, and the
      // per-document record means a second press only retries what didn't land.
      setFailed(n)
      setPending(await pendingLocalWork(userId))
      return
    }
    close()
    onImported()
  }

  return (
    <Modal title="Reports saved in this browser" onClose={close} width={460}>
      <p className="text-xs leading-snug text-dim">
        {pending.length === 1
          ? 'There is one report saved in this browser, from before you had an account.'
          : `There are ${pending.length} reports saved in this browser, from before you had an account.`}{' '}
        Add {pending.length === 1 ? 'it' : 'them'} to{' '}
        <span className="text-ink">{email}</span> and{' '}
        {pending.length === 1 ? 'it' : 'they'} will be there on any machine you sign in on.
      </p>

      <ul className="max-h-40 overflow-y-auto border-t border-ink/10">
        {pending.map((doc) => (
          <li key={doc.id} className="border-b border-ink/10 py-1.5 text-xs">
            {doc.name}
          </li>
        ))}
      </ul>

      {failed > 0 && (
        <p className="border border-danger px-2 py-1.5 text-[11px] text-danger">
          {failed === 1 ? 'One report' : `${failed} reports`} could not be uploaded. Nothing was
          lost — try again, and only the ones still listed will be sent.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void onAdd()}>
          {busy ? 'Adding…' : 'Add to my account'}
        </Button>
        <Button variant="quiet" disabled={busy} onClick={close}>
          Not now
        </Button>
        <Button
          variant="quiet"
          disabled={busy}
          title="Stop offering this on this browser"
          onClick={() => {
            markNever(userId)
            close()
          }}
        >
          Never ask again
        </Button>
      </div>

      <p className="text-[11px] leading-snug text-dim">
        The copies in this browser are kept either way — nothing here deletes them.
      </p>
    </Modal>
  )
}
