import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The one Supabase client.
 *
 * ## Why it is built lazily
 *
 * The `npm run check:*` scripts import modules out of `src/` directly and run
 * them under node through a small TypeScript loader. Under node there is no
 * `import.meta.env`, so reading configuration at module scope would mean that
 * merely *importing* anything that transitively reaches this file kills a check
 * script at import time, with an error pointing at Vite rather than at the
 * import that caused it.
 *
 * Building on first call instead means an accidental import is harmless — only
 * actually talking to the server needs configuration. `doc/imageRef.ts` exists
 * for the same reason, from the other direction.
 *
 * ## Why the key in the bundle is not a mistake
 *
 * `VITE_` variables are compiled into the JavaScript that ships, so the anon
 * key is readable by anyone who opens devtools. That is how it is meant to
 * work: the anon key only says "some anonymous visitor", and the row-level
 * security policies in `supabase/migrations/` are what actually decide who can
 * read whose reports. The `service_role` key bypasses those policies entirely
 * and must never appear in this repository.
 */

const env = (key: string): string | undefined => {
  // `import.meta.env` under Vite, `process.env` under the node check scripts.
  const meta = (import.meta as { env?: Record<string, string | undefined> }).env
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  return meta?.[key] ?? proc?.env?.[key]
}

let client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (client) return client

  const url = env('VITE_SUPABASE_URL')
  const anonKey = env('VITE_SUPABASE_ANON_KEY')
  if (!url || !anonKey) {
    // Loud and specific: the alternative is a client that looks fine and then
    // fails on every request with a 404 from an undefined host.
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env.local and fill in ' +
        'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.',
    )
  }

  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Lets a password-reset link landing on `/` be picked up without a router.
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })
  return client
}

/** True when configuration is present — lets the UI explain itself instead of throwing. */
export const isConfigured = (): boolean =>
  !!env('VITE_SUPABASE_URL') && !!env('VITE_SUPABASE_ANON_KEY')
