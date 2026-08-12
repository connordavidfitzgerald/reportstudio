import { useMemo } from 'react'
import { useImage } from './useImage'
import { getImage } from '../doc/imageCache'
import { OVERLAYS } from '../config/brand'
import type { RenderAssets } from '../render/compose'

/**
 * The two soft-light washes.
 *
 * ## Still missing
 *
 * Neither texture has been supplied yet — the file uses
 * `Texturelabs_Grunge_265XL` and a layer named "Sunset 001". Vite resolves
 * these eagerly, so they are looked up through a glob rather than imported:
 * a bare `import` of a file that isn't there fails the build, which would mean
 * the whole editor refused to start over a decorative overlay.
 *
 * Drop the two files into `src/assets/overlays/` named `grunge265.*` and
 * `sunset001.*` and they light up with no code change.
 */
const overlayUrls = import.meta.glob('../assets/overlays/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const urlFor = (id: string): string | null => {
  const hit = Object.entries(overlayUrls).find(([path]) => path.includes(`/${id}.`))
  return hit ? hit[1] : null
}

export function useRenderAssets(): RenderAssets {
  const grunge = useImage(urlFor(OVERLAYS[0].id))
  const sunset = useImage(urlFor(OVERLAYS[1].id))

  return useMemo(
    () => ({
      image: getImage,
      overlays: { [OVERLAYS[0].id]: grunge, [OVERLAYS[1].id]: sunset },
    }),
    [grunge, sunset],
  )
}
