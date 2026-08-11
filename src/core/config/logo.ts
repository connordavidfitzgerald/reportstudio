import logo from '../../assets/logo.webp'

/**
 * The brand logo, kept out of `constants.ts` on purpose.
 *
 * Importing a binary asset makes a module unloadable outside a bundler, and
 * `constants.ts` is otherwise pure values that the Node-run check scripts want to
 * reach (via `config/formats.ts`). One asset import shouldn't cost the whole
 * constants module its portability.
 *
 * `fallbackText` renders if the image fails to load.
 */
export const LOGO = {
  src: logo as string,
  fallbackText: '◆ STUDIO',
}
