import type { Deck } from './types'
import { createDeck } from './defaults'
import { collectImageRefs, mapDeckImageRefs } from './imageCache'
import { getImageBlob, putImageBlob, type ImageRef } from './imageStore'
import { CURRENT_VERSION, migrate, type StoredAny } from '../store/migrations'

/**
 * The `.lehub.json` transfer format — a document that can leave this browser.
 *
 * ## Why images are inlined
 *
 * A deck is plain JSON, so `JSON.stringify(deck)` looks like a complete
 * document. It isn't: an uploaded photograph is stored as `{ kind: 'blob', id }`
 * pointing into *this* origin's IndexedDB. Sent to a colleague, every one of
 * those refs resolves to nothing and the report arrives as a set of grey boxes —
 * silently, since a missing image is a legitimate state.
 *
 * So the format carries the bytes: every referenced blob is written out as a
 * data URI beside the deck, and importing writes them back as fresh uploads and
 * rewrites the refs to match. Bundled assets stay `{ kind: 'url' }` — they ship
 * with the app and re-resolve on their own.
 *
 * The file is therefore large — the images dominate it — which is correct for
 * something whose whole purpose is to be a complete, portable copy.
 */

export interface TransferDoc {
  /** Marks the file as ours, so an unrelated .json is refused with a reason. */
  format: 'lehub.report'
  v: number
  deck: Deck
  /** Blob id → data URI, for every uploaded image the deck references. */
  images: Record<string, string>
}

const blobToDataUri = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })

/** Serialise a document and everything it needs, ready to write to disk. */
export async function toTransferJson(deck: Deck): Promise<string> {
  const images: Record<string, string> = {}
  await Promise.all(
    collectImageRefs(deck)
      .filter((ref): ref is Extract<ImageRef, { kind: 'blob' }> => ref.kind === 'blob')
      .map(async (ref) => {
        const blob = await getImageBlob(ref.id)
        // An image whose bytes have gone is skipped, not fatal: the export still
        // carries the words, and the import will clear the dangling ref.
        if (blob) images[ref.id] = await blobToDataUri(blob)
      }),
  )
  const doc: TransferDoc = { format: 'lehub.report', v: CURRENT_VERSION, deck, images }
  return JSON.stringify(doc)
}

/** Thrown with a sentence the UI can show verbatim. */
export class TransferError extends Error {}

/**
 * Read a `.lehub.json` back into a document on this machine.
 *
 * Every image is re-uploaded and given a *new* id, so importing the same file
 * twice yields two independent documents rather than two documents sharing
 * blobs that either one could prune out from under the other.
 */
export async function fromTransferJson(text: string): Promise<Deck> {
  let doc: TransferDoc
  try {
    doc = JSON.parse(text) as TransferDoc
  } catch {
    throw new TransferError("That file isn't valid JSON.")
  }
  if (doc?.format !== 'lehub.report') {
    throw new TransferError("That doesn't look like a Le HUB report file.")
  }

  const stored = migrate({ v: doc.v, deck: doc.deck, leafIndex: 0 } as StoredAny)
  if (!stored || !stored.deck.leaves.length) {
    throw new TransferError(
      doc.v > CURRENT_VERSION
        ? 'That report was made with a newer version of this tool.'
        : 'That report was made with a version of this tool that is too old to open.',
    )
  }

  // Write the images first, so the ref rewrite below is a pure lookup.
  const remap = new Map<string, ImageRef>()
  await Promise.all(
    Object.entries(doc.images ?? {}).map(async ([id, dataUri]) => {
      try {
        const blob = await fetch(dataUri).then((r) => r.blob())
        const ref = await putImageBlob(blob)
        if (ref) remap.set(id, ref)
      } catch {
        /* one unreadable image shouldn't cost the whole report */
      }
    }),
  )

  const deck = { ...createDeck(stored.deck.leaves), ...stored.deck }
  return mapDeckImageRefs(deck, (ref) =>
    ref.kind === 'blob' ? (remap.get(ref.id) ?? null) : ref,
  )
}
