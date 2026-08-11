import type { Rect } from '../core/types'

/**
 * A canvas-shaped recorder that turns drawing into data.
 *
 * ## Why this exists
 *
 * The PDF backend needs to know *what* was drawn — glyph runs, fills, images —
 * not just end up with pixels. The obvious approach is a second module that
 * re-derives the same geometry as `core/elements.ts` and emits a display list.
 * That produces two implementations of the same layout arithmetic, and the only
 * defence against them drifting is a pixel-diff test that catches the drift
 * after it happens.
 *
 * Recording removes the second implementation instead. The real draw functions
 * run unmodified against this object, and the ops fall out as a by-product, so
 * canvas and PDF cannot disagree about geometry — there is only one source of it.
 *
 * It also means `drawHeaderBlock`'s per-grapheme `fillText` calls (see
 * `core/elements.ts`) arrive already positioned at exact measured advances,
 * which is what the notched swash hugs and what the PDF needs to reproduce.
 *
 * ## Fidelity
 *
 * Only the ~18 canvas members the draw code actually uses are implemented.
 * Anything else throws by name rather than silently no-op'ing, so a future draw
 * call that this doesn't understand fails loudly at the point of use instead of
 * quietly vanishing from exports.
 */

/**
 * Compositing state every op carries.
 *
 * Note there is no `fill` here: an image op doesn't have one, and recording the
 * ambient `fillStyle` alongside it would be state that means nothing and that a
 * consumer cannot round-trip. Only ops that actually fill carry a colour.
 */
export interface Style {
  alpha: number
  composite: GlobalCompositeOperation
  /** Rect clips only — the sole clip the draw code uses (cover-fitting images). */
  clip: Rect | null
}

export interface FillStyle extends Style {
  fill: string
}

export interface TextStyle extends FillStyle {
  font: string
  align: CanvasTextAlign
  baseline: CanvasTextBaseline
}

export type Point = { x: number; y: number }

export type DrawOp =
  | { op: 'rect'; rect: Rect; style: FillStyle }
  /** A filled path, as closed rings — the notched outline's unioned polygons. */
  | { op: 'path'; rings: Point[][]; style: FillStyle }
  /** One text run at a baseline origin. Often a single grapheme, by design. */
  | { op: 'text'; text: string; x: number; y: number; style: TextStyle }
  | { op: 'image'; image: CanvasImageSource; rect: Rect; style: Style }

interface State {
  fillStyle: string
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  globalAlpha: number
  globalCompositeOperation: GlobalCompositeOperation
  clip: Rect | null
}

const initialState = (): State => ({
  fillStyle: '#000',
  font: '10px sans-serif',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  clip: null,
})

class Recorder {
  readonly ops: DrawOp[] = []
  private s: State = initialState()
  private stack: State[] = []
  private rings: Point[][] = []
  private cur: Point[] = []

  /** Real context used only for text metrics; never drawn into. */
  private readonly metrics: CanvasRenderingContext2D

  constructor(metrics: CanvasRenderingContext2D) {
    this.metrics = metrics
  }

  // -- state ---------------------------------------------------------------
  get fillStyle(): string { return this.s.fillStyle }
  set fillStyle(v: string) { this.s.fillStyle = v }
  get font(): string { return this.s.font }
  set font(v: string) { this.s.font = v; this.metrics.font = v }
  get textAlign(): CanvasTextAlign { return this.s.textAlign }
  set textAlign(v: CanvasTextAlign) { this.s.textAlign = v }
  get textBaseline(): CanvasTextBaseline { return this.s.textBaseline }
  set textBaseline(v: CanvasTextBaseline) { this.s.textBaseline = v; this.metrics.textBaseline = v }
  get globalAlpha(): number { return this.s.globalAlpha }
  set globalAlpha(v: number) { this.s.globalAlpha = v }
  get globalCompositeOperation(): GlobalCompositeOperation { return this.s.globalCompositeOperation }
  set globalCompositeOperation(v: GlobalCompositeOperation) { this.s.globalCompositeOperation = v }

  save(): void { this.stack.push({ ...this.s }) }
  restore(): void { const p = this.stack.pop(); if (p) this.s = p }

  /** Compositing state only — see {@link Style}. */
  private style(): Style {
    return {
      alpha: this.s.globalAlpha,
      composite: this.s.globalCompositeOperation,
      clip: this.s.clip,
    }
  }

  private fillStyleOf(): FillStyle {
    return { ...this.style(), fill: this.s.fillStyle }
  }

  // -- paths ---------------------------------------------------------------
  beginPath(): void { this.rings = []; this.cur = [] }
  moveTo(x: number, y: number): void {
    if (this.cur.length) this.rings.push(this.cur)
    this.cur = [{ x, y }]
  }
  lineTo(x: number, y: number): void { this.cur.push({ x, y }) }
  closePath(): void { if (this.cur.length) { this.rings.push(this.cur); this.cur = [] } }
  rect(x: number, y: number, w: number, h: number): void {
    this.rings.push([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }])
  }

  fill(): void {
    const rings = this.cur.length ? [...this.rings, this.cur] : this.rings
    if (rings.length) this.ops.push({ op: 'path', rings: rings.map((r) => [...r]), style: this.fillStyleOf() })
  }

  clip(): void {
    // The draw code only ever clips to a single rectangle (image cover-fit).
    // Anything else would silently lose its clip in the PDF, so refuse it.
    const rings = this.cur.length ? [...this.rings, this.cur] : this.rings
    if (rings.length !== 1 || rings[0].length !== 4) {
      throw new Error(`[record] only rectangular clips are supported (got ${rings.length} ring(s))`)
    }
    const [a, , c] = rings[0]
    this.s.clip = { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.abs(c.x - a.x), h: Math.abs(c.y - a.y) }
  }

  // -- painting ------------------------------------------------------------
  fillRect(x: number, y: number, w: number, h: number): void {
    this.ops.push({ op: 'rect', rect: { x, y, w, h }, style: this.fillStyleOf() })
  }

  fillText(text: string, x: number, y: number): void {
    this.ops.push({
      op: 'text',
      text,
      x,
      y,
      style: { ...this.fillStyleOf(), font: this.s.font, align: this.s.textAlign, baseline: this.s.textBaseline },
    })
  }

  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void {
    this.ops.push({ op: 'image', image, rect: { x: dx, y: dy, w: dw, h: dh }, style: this.style() })
  }

  measureText(text: string): TextMetrics {
    return this.metrics.measureText(text)
  }

  clearRect(): void { /* export starts from a blank page; nothing to record */ }
}

/**
 * A recorder typed as a canvas context.
 *
 * The cast is the one unsafe seam, so it is guarded: any member the draw code
 * reaches for that isn't implemented above throws immediately, naming itself.
 * A silently-missing method would mean content that renders on screen and is
 * absent from the PDF — the worst possible failure for an export.
 */
export function createRecorder(metrics: CanvasRenderingContext2D): {
  ctx: CanvasRenderingContext2D
  ops: DrawOp[]
} {
  const rec = new Recorder(metrics)
  const guarded = new Proxy(rec, {
    get(target, prop, receiver) {
      if (prop in target || typeof prop === 'symbol') return Reflect.get(target, prop, receiver)
      throw new Error(
        `[record] canvas member "${String(prop)}" is not implemented. Add it to ` +
          `render/record.ts — otherwise it would draw on screen and vanish from the PDF.`,
      )
    },
  })
  return { ctx: guarded as unknown as CanvasRenderingContext2D, ops: rec.ops }
}

/**
 * Replay recorded ops onto a real context.
 *
 * Used to verify the recording is faithful, and as the reference implementation
 * for what each op means — the PDF painter has to agree with this.
 */
export function replayOps(ctx: CanvasRenderingContext2D, ops: DrawOp[]): void {
  for (const item of ops) {
    ctx.save()
    ctx.globalAlpha = item.style.alpha
    ctx.globalCompositeOperation = item.style.composite
    if (item.style.clip) {
      const c = item.style.clip
      ctx.beginPath()
      ctx.rect(c.x, c.y, c.w, c.h)
      ctx.clip()
    }
    switch (item.op) {
      case 'rect':
        ctx.fillStyle = item.style.fill
        ctx.fillRect(item.rect.x, item.rect.y, item.rect.w, item.rect.h)
        break
      case 'path':
        ctx.fillStyle = item.style.fill
        ctx.beginPath()
        for (const ring of item.rings) {
          ring.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
          ctx.closePath()
        }
        ctx.fill()
        break
      case 'text':
        ctx.fillStyle = item.style.fill
        ctx.font = item.style.font
        ctx.textAlign = item.style.align
        ctx.textBaseline = item.style.baseline
        ctx.fillText(item.text, item.x, item.y)
        break
      case 'image':
        ctx.drawImage(item.image, item.rect.x, item.rect.y, item.rect.w, item.rect.h)
        break
    }
    ctx.restore()
  }
}
