import { useState } from 'react'
import { DEFAULT_HALFTONE, EXPORT_SCALES } from '../core/config/constants'
import { PALETTES } from '../core/config/palettes'
import { PAPERS } from '../core/config/papers'
import { isHalftoneAvailable } from '../core/halftone/halftoneRenderer'
import { IconChoice, Section, Segmented, Slider, TextField } from '../core/ui'
import { PAGE_FORMATS, type FormatId } from '../config/formats'
import type { BgRole, ImageElement, PageElement, TextElement, TextVariant } from '../doc/types'
import { buildTemplate, templatesFor } from '../templates'
import { useCurrentPage, useDeck } from '../store/useDeck'
import { OutlinePanel } from './OutlinePanel'
import { LANGS, type Lang } from '../doc/localized'
import { deckPages } from '../doc/sections'
import { useRenderAssets } from '../hooks/useRenderAssets'
import { ToolToggle } from './ToolToggle'

// pdf-lib is ~1MB and only needed when someone actually exports, so it is
// loaded on demand rather than shipped in the initial bundle.
const exporter = () => import('../export/exportPdf')

const BTN = 'border border-black px-2 py-1 font-review text-xs uppercase hover:bg-black/5'
const BTN_ON = 'border border-black bg-black px-2 py-1 font-review text-xs uppercase text-white'

export function Controls() {
  const deck = useDeck((s) => s.deck)
  const page = useCurrentPage()
  const selectedIds = useDeck((s) => s.selectedIds)
  const setDeck = useDeck((s) => s.setDeck)
  const setFormat = useDeck((s) => s.setFormat)
  const setElement = useDeck((s) => s.setElement)
  const applyTemplate = useDeck((s) => s.applyTemplate)
  const assets = useRenderAssets()

  const [busy, setBusy] = useState<string | null>(null)

  const selected = page.items.map((i) => i.el).filter((e) => selectedIds.includes(e.id))
  const one = selected.length === 1 ? selected[0] : null

  const changeFormat = (f: FormatId) => {
    if (f === deck.format) return
    // The remap is proportional and lossy for tight compositions, so it asks.
    const ok = confirm(
      'Switching format remaps every element onto the new grid. Tight compositions may need adjusting. Continue?',
    )
    if (ok) setFormat(f)
  }

  const togglePaper = (id: string) => {
    const on = deck.paperIds.includes(id)
    setDeck(
      { paperIds: on ? deck.paperIds.filter((p) => p !== id) : [...deck.paperIds, id] },
      'deck:paper',
    )
  }

  /**
   * Export one PDF per language, from the same layout.
   *
   * Each edition is typeset independently rather than sharing a page plan:
   * French runs perhaps 15% longer than English, so forcing both into the same
   * pagination would either overset one or loosen the other. Two documents from
   * one source is the honest output.
   */
  const exportPdf = async (scale: 1 | 2, langs: Lang[] = [deck.lang]) => {
    setBusy('Preparing…')
    try {
      const { exportDeckPdf, download } = await exporter()
      for (const lang of langs) {
        const edition = langs.length > 1 ? { ...deck, lang } : deck
        const blob = await exportDeckPdf(edition, assets, {
          scale,
          onProgress: (done, total) =>
            setBusy(langs.length > 1 ? `${lang.toUpperCase()} ${done} / ${total}` : `Page ${done} / ${total}`),
        })
        download(blob, `lehub-${deck.format}-${lang}.pdf`)
      }
    } catch (err) {
      console.error(err)
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  const exportPng = async () => {
    setBusy('Rendering…')
    try {
      const { exportPagePng, download } = await exporter()
      const index = deckPages(deck).findIndex((p) => p.id === page.id)
      download(await exportPagePng(deck, index, assets), `lehub-page-${index + 1}.png`)
    } catch (err) {
      console.error(err)
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-4">
        <Section title="Tool">
          <ToolToggle />
        </Section>

        <Section title="Format">
          <Segmented<FormatId>
            value={deck.format}
            onChange={changeFormat}
            options={PAGE_FORMATS.map((f) => ({ value: f.id, label: f.label }))}
          />
        </Section>

        <OutlinePanel />

        <Section title="Template" collapsible defaultOpen>
          <div className="grid grid-cols-2 gap-2 px-1">
            {templatesFor(deck.format).map((t) => (
              <button
                key={t.id}
                type="button"
                className={BTN}
                onClick={() => applyTemplate(page.id, buildTemplate(t, deck.format), t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Palette" collapsible defaultOpen>
          <div className="grid grid-cols-2 gap-2 px-1">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDeck({ paletteId: p.id }, 'deck:palette')}
                className={deck.paletteId === p.id ? BTN_ON : BTN}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 border border-black"
                    style={{ background: p.background }}
                  />
                  {p.label}
                </span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Paper" collapsible>
          {PAPERS.filter((p) => p.src).map((p) => {
            const on = deck.paperIds.includes(p.id)
            return (
              <div key={p.id} className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => togglePaper(p.id)}
                  className={on ? BTN_ON : BTN}
                >
                  Paper {p.label}
                </button>
                {on && (
                  <Slider
                    label="Opacity"
                    min={0}
                    max={1}
                    step={0.01}
                    value={deck.paperOpacities[p.id] ?? p.defaultOpacity}
                    onChange={(v) =>
                      setDeck(
                        { paperOpacities: { ...deck.paperOpacities, [p.id]: v } },
                        'deck:paper-opacity',
                      )
                    }
                    format={(v) => `${Math.round(v * 100)}%`}
                  />
                )}
              </div>
            )
          })}
        </Section>

        {one ? (
          <ElementControls element={one} pageId={page.id} setElement={setElement} />
        ) : (
          <Section title="Element">
            <p className="px-1 font-mono text-xs uppercase text-black/50">
              {selected.length > 1
                ? `${selected.length} selected`
                : 'Nothing selected'}
            </p>
          </Section>
        )}
      </div>

      <footer className="flex flex-col gap-2 border-t border-black pt-3">
        <div className="flex gap-2">
          {EXPORT_SCALES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={!!busy}
              className={`${BTN} flex-1 disabled:opacity-40`}
              onClick={() => void exportPdf(s as 1 | 2)}
            >
              PDF {s}×
            </button>
          ))}
          <button
            type="button"
            disabled={!!busy}
            className={`${BTN} disabled:opacity-40`}
            onClick={() => void exportPng()}
          >
            PNG
          </button>
        </div>
        <button
          className="border border-black px-2 py-1 text-xs hover:bg-black hover:text-white disabled:opacity-40"
          disabled={!!busy}
          onClick={() => exportPdf(2, LANGS)}
          title="One PDF per language, each typeset independently"
        >
          PDF EN + FR
        </button>

        {busy && <span className="px-1 font-mono text-xs uppercase">{busy}</span>}
      </footer>
    </div>
  )
}

const VARIANTS: { value: TextVariant; label: string }[] = [
  { value: 'header', label: 'Head' },
  { value: 'badge', label: 'Badge' },
  { value: 'paragraph', label: 'Para' },
  { value: 'plain', label: 'Plain' },
]

const BG_ROLES: { value: BgRole; label: string }[] = [
  { value: 'outline', label: 'Pink' },
  { value: 'highlight', label: 'High' },
  { value: 'secondary', label: 'Sec' },
  { value: 'none', label: 'None' },
]

function ElementControls({
  element,
  pageId,
  setElement,
}: {
  element: PageElement
  pageId: string
  setElement: (pageId: string, id: string, patch: Partial<PageElement>, tag?: string) => void
}) {
  const patch = (p: Partial<PageElement>, tag?: string) => setElement(pageId, element.id, p, tag)

  if (element.kind === 'text') return <TextControls el={element} patch={patch} />
  if (element.kind === 'image') return <ImageControls el={element} patch={patch} />

  if (element.kind === 'block') {
    return (
      <Section title="Block">
        <Segmented<BgRole>
          value={element.bg}
          onChange={(v) => patch({ bg: v }, 'element:bg')}
          options={BG_ROLES.filter((r) => r.value !== 'none')}
        />
      </Section>
    )
  }
  return (
    <Section title="Logo">
      <p className="px-1 font-mono text-xs uppercase text-black/50">Resize on canvas</p>
    </Section>
  )
}

function TextControls({
  el,
  patch,
}: {
  el: TextElement
  patch: (p: Partial<PageElement>, tag?: string) => void
}) {
  return (
    <Section title="Text">
      <TextField
        label="Content"
        value={el.text}
        multiline
        rows={3}
        onChange={(v) => patch({ text: v }, `text:${el.id}`)}
      />
      <Segmented<TextVariant>
        value={el.variant}
        onChange={(v) => patch({ variant: v }, 'element:variant')}
        options={VARIANTS}
      />
      {/* Sizes are steps on the modular scale, never a free number — that is
          what keeps a deck's typography on the brand ladder. */}
      <Slider
        label="Size step"
        min={-4}
        max={10}
        step={1}
        value={el.step}
        onChange={(v) => patch({ step: v }, 'element:step')}
      />
      {el.variant === 'header' && (
        <button
          type="button"
          className={el.autoFit ? BTN_ON : BTN}
          onClick={() => patch({ autoFit: !el.autoFit }, 'element:autofit')}
        >
          Fit to width
        </button>
      )}
      <IconChoice<TextElement['align']>
        label="Align"
        value={el.align}
        cols={3}
        onChange={(v) => patch({ align: v }, 'element:align')}
        options={[
          { value: 'left', icon: <span className="text-xs">L</span> },
          { value: 'center', icon: <span className="text-xs">C</span> },
          { value: 'right', icon: <span className="text-xs">R</span> },
        ]}
      />
      <Segmented<BgRole>
        value={el.bg}
        onChange={(v) => patch({ bg: v }, 'element:bg')}
        options={BG_ROLES}
      />
      <button
        type="button"
        className={el.autoHeight ? BTN_ON : BTN}
        onClick={() => patch({ autoHeight: !el.autoHeight }, 'element:autoheight')}
      >
        Auto height
      </button>
    </Section>
  )
}

function ImageControls({
  el,
  patch,
}: {
  el: ImageElement
  patch: (p: Partial<PageElement>, tag?: string) => void
}) {
  const h = el.halftone
  const set = (k: keyof NonNullable<ImageElement['halftone']>, v: number) =>
    patch({ halftone: { ...(h ?? DEFAULT_HALFTONE), [k]: v } }, `halftone:${k}`)

  return (
    <Section title="Image">
      {!isHalftoneAvailable() && (
        <p className="px-1 font-mono text-xs uppercase text-black/50">
          WebGL unavailable — halftone disabled, images draw as-is
        </p>
      )}
      <button
        type="button"
        className={h ? BTN_ON : BTN}
        onClick={() => patch({ halftone: h ? null : { ...DEFAULT_HALFTONE } }, 'element:halftone')}
      >
        Halftone
      </button>
      {h && (
        <>
          <Slider label="Dot" min={1} max={12} step={0.5} value={h.dotScale}
            onChange={(v) => set('dotScale', v)} />
          <Slider label="Contrast" min={0.5} max={2} step={0.01} value={h.contrast}
            onChange={(v) => set('contrast', v)} />
          <Slider label="Brightness" min={0.5} max={1.5} step={0.01} value={h.brightness}
            onChange={(v) => set('brightness', v)} />
          <Slider label="Saturation" min={0} max={2} step={0.01} value={h.saturation}
            onChange={(v) => set('saturation', v)} />
          <Slider label="Shadows" min={-1} max={1} step={0.01} value={h.shadows}
            onChange={(v) => set('shadows', v)} />
          <Slider label="Highlights" min={-1} max={1} step={0.01} value={h.highlights}
            onChange={(v) => set('highlights', v)} />
          <Slider label="Sharpness" min={0} max={1} step={0.01} value={h.sharpness}
            onChange={(v) => set('sharpness', v)} />
        </>
      )}
    </Section>
  )
}
