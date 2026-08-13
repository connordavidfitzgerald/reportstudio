import { useRef, useState, type DragEvent } from 'react'
import { getImage, useImageCache } from '../doc/imageCache'
import { putImageBlob, type ImageRef } from '../doc/imageStore'
import { Button } from './ui'

/**
 * Putting a photograph on the page.
 *
 * The storage half of this has been finished since the poster app — uploads go
 * to IndexedDB and the document keeps a reference — but nothing ever called it,
 * so an "Image" component could only ever be the grey placeholder box.
 *
 * ## The focal point
 *
 * Figures are cover-fitted: the image fills its frame and the overflow is
 * cropped. Which part survives that crop is `focus`, and it is the difference
 * between a portrait framed on someone's face and one framed on their shoulder.
 * The painter has always honoured it (`render/compose.ts` → `drawImage`); here
 * it is a click on the preview, which is the only way to choose it that doesn't
 * involve typing two numbers between 0 and 1.
 */

export function ImageField({
  value,
  onChange,
  focus,
  onFocusChange,
  label = 'Image',
}: {
  value: ImageRef | null
  onChange: (ref: ImageRef | null) => void
  /** Omit to hide the focal-point control — a contain-fitted image has none. */
  focus?: { x: number; y: number }
  onFocusChange?: (focus: { x: number; y: number }) => void
  label?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  useImageCache() // repaint when a decode lands
  const img = getImage(value)

  const accept = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    setBusy(true)
    const ref = await putImageBlob(file)
    setBusy(false)
    // A null ref means storage refused the write. Leaving the old image in
    // place is the honest outcome — better than clearing the frame and looking
    // like the upload worked.
    if (ref) onChange(ref)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    void accept(e.dataTransfer.files[0])
  }

  const setFocusFrom = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onFocusChange) return
    const box = e.currentTarget.getBoundingClientRect()
    onFocusChange({
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    })
  }

  const at = focus ?? { x: 0.5, y: 0.5 }

  return (
    <div className="flex flex-col gap-1.5 px-1">
      <span className="text-2xs leading-none text-dim">{label}</span>

      {img ? (
        <div
          onClick={setFocusFrom}
          title={onFocusChange ? 'Click the part that must stay in frame' : undefined}
          className={`relative border border-ink/20 ${onFocusChange ? 'cursor-crosshair' : ''}`}
        >
          <img src={img.src} alt="" className="block max-h-40 w-full object-contain" />
          {onFocusChange && (
            <span
              aria-hidden
              style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full
                border-2 border-white bg-ink shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
            />
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={`flex h-24 w-full items-center justify-center border border-dashed px-3 text-center text-[11px] leading-snug transition
            ${over ? 'border-ink/25 bg-ink/10 text-ink' : 'border-ink/25/30 text-dim hover:border-ink/25 hover:text-ink'}`}
        >
          {busy ? 'Adding…' : 'Drop a photograph here, or click to choose one'}
        </button>
      )}

      {img && (
        <div className="flex gap-2">
          <Button variant="quiet" onClick={() => input.current?.click()}>
            Replace
          </Button>
          <Button variant="quiet" onClick={() => onChange(null)}>
            Remove
          </Button>
          {onFocusChange && (at.x !== 0.5 || at.y !== 0.5) && (
            <Button variant="quiet" onClick={() => onFocusChange({ x: 0.5, y: 0.5 })}>
              Centre
            </Button>
          )}
        </div>
      )}

      {img && onFocusChange && (
        <p className="text-[11px] leading-snug text-dim">
          Click the photograph to choose what stays in frame when it is cropped.
        </p>
      )}

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0]
          e.target.value = ''
          void accept(picked)
        }}
      />
    </div>
  )
}
