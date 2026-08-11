import type { HalftoneParams } from '../types'
import { HalftoneGL } from './gl'

let engine: HalftoneGL | null = null
/** null = not probed yet; false = WebGL is unavailable and we've stopped trying. */
let available: boolean | null = null

function getEngine(): HalftoneGL | null {
  if (engine) return engine
  if (available === false) return null
  try {
    engine = new HalftoneGL()
    available = true
  } catch {
    available = false
    engine = null
  }
  return engine
}

/**
 * Whether the shader can run at all. The poster app let `new HalftoneGL()` throw
 * with no fallback — survivable when a dead screen is one poster, fatal when it
 * kills a 40-page export mid-run. Callers use this to draw the plain image and
 * warn once instead.
 */
export function isHalftoneAvailable(): boolean {
  return getEngine() !== null
}

const deg2rad = (d: number) => (d * Math.PI) / 180

// Reused CPU canvas for cover-fitting the source into the target region.
const coverCanvas = document.createElement('canvas')
const coverCtx = coverCanvas.getContext('2d')!

// Cache processed results (keyed by a signature) so redraws that don't touch the
// image/params (e.g. typing text) don't re-run the shader. A small LRU keeps the
// live preview, the export, and several artboard thumbnails from thrashing one
// another when they render the same source at different sizes.
/**
 * The budget is *pixels*, not entries. A 3840×2160 snapshot is ~33MB of RGBA, so
 * an entry count is the wrong unit — 16 of those would be half a gigabyte while
 * 16 thumbnail-sized ones are a rounding error. 24M pixels is roughly 96MB.
 */
const CACHE_MAX_PIXELS = 24e6
const cache = new Map<string, HTMLCanvasElement>()
let cachedPixels = 0

function evictToBudget(): void {
  // Keep at least one entry, so a single oversized render still works.
  while (cachedPixels > CACHE_MAX_PIXELS && cache.size > 1) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    const c = cache.get(oldest)!
    cache.delete(oldest)
    cachedPixels -= c.width * c.height
  }
}
let imageIds = new WeakMap<HTMLImageElement, number>()
let nextId = 1
function idOf(img: HTMLImageElement): number {
  let id = imageIds.get(img)
  if (!id) {
    id = nextId++
    imageIds.set(img, id)
  }
  return id
}

/** Draw `img` into `coverCanvas` at w×h using object-fit: cover. */
function coverFit(img: HTMLImageElement, w: number, h: number) {
  coverCanvas.width = w
  coverCanvas.height = h
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  coverCtx.clearRect(0, 0, w, h)
  coverCtx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

export interface HalftoneOptions {
  /** >1 when exporting; scales dot pitch so it stays physically constant. */
  renderScale?: number
  /**
   * False for one-shot renders (every page of an export). Those results are used
   * exactly once, so caching them would evict the live preview's entries and
   * retain a 33MB canvas per page for nothing.
   */
  cache?: boolean
}

/**
 * A canvas of the halftoned image, sized exactly to the target region — or null
 * when WebGL is unavailable, in which case the caller should draw the source
 * image cover-fitted instead.
 */
export function getHalftone(
  img: HTMLImageElement,
  regionW: number,
  regionH: number,
  params: HalftoneParams,
  opts: HalftoneOptions = {},
): HTMLCanvasElement | null {
  const renderScale = opts.renderScale ?? 1
  const useCache = opts.cache ?? true
  const gl = getEngine()
  if (!gl) return null

  const w = Math.max(1, Math.round(regionW))
  const h = Math.max(1, Math.round(regionH))
  const key = JSON.stringify([idOf(img), w, h, params, renderScale])
  if (useCache) {
    const hit = cache.get(key)
    if (hit) {
      // Refresh LRU recency.
      cache.delete(key)
      cache.set(key, hit)
      return hit
    }
  }

  coverFit(img, w, h)
  const out = gl.render(coverCanvas, w, h, {
    dotScale: params.dotScale * renderScale,
    contrast: params.contrast,
    brightness: params.brightness,
    saturation: params.saturation,
    shadows: params.shadows,
    highlights: params.highlights,
    sharpness: params.sharpness,
    angles: [
      deg2rad(params.angleC),
      deg2rad(params.angleM),
      deg2rad(params.angleY),
      deg2rad(params.angleK),
    ],
  })

  // Copy out of the shared GL canvas so the cached result survives the next render.
  const snapshot = document.createElement('canvas')
  snapshot.width = w
  snapshot.height = h
  snapshot.getContext('2d')!.drawImage(out, 0, 0)
  if (useCache) {
    cache.set(key, snapshot)
    cachedPixels += w * h
    evictToBudget()
  }
  return snapshot
}
