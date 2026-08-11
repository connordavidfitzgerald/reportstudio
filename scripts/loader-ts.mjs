/**
 * Resolve hook: let Node import the extensionless relative specifiers that the
 * app uses throughout (`'../config/formats'`), which Vite resolves but Node's
 * ESM does not.
 *
 * Without this, a check script can only reach modules whose relative imports are
 * all type-only — which rules out most of `src/` for no good reason. Node 24
 * strips the types itself; this only fixes the specifiers.
 */
const HAS_EXT = /\.[cm]?[jt]sx?$/

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !HAS_EXT.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context)
    } catch {
      // fall through to the original specifier so the real error surfaces
    }
  }
  return nextResolve(specifier, context)
}
