import { useMemo } from 'react'
import { LOGO } from '../core/config/logo'
import { useImage } from '../core/hooks/useImage'
import { usePaperImages } from '../core/hooks/usePaperImages'
import { getImage } from '../doc/imageCache'
import type { RenderAssets } from '../render/env'

/**
 * The assets every render needs.
 *
 * `image` is a synchronous lookup that returns null until a decode lands — the
 * render path must never await. Repainting once it *has* landed is the caller's
 * job: subscribe to `useImageCache()` and put it in the render effect's deps.
 */
export function useRenderAssets(): RenderAssets {
  const logo = useImage(LOGO.src)
  const papers = usePaperImages()
  return useMemo(() => ({ logo, papers, image: getImage }), [logo, papers])
}
