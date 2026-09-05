/**
 * Whether this deploy is the real production site, as opposed to a Vercel
 * preview deploy or a local checkout — both of which are usually full of
 * throwaway test data, so a production-only feature (e.g. the stale-tournament
 * reminder on the organizer home) would otherwise be permanently on and
 * meaningless there.
 *
 * `NEXT_PUBLIC_VERCEL_ENV` re-exposes Vercel's server-only `VERCEL_ENV` system
 * variable ('production' | 'preview' | 'development') to the client bundle —
 * see next.config.ts — so this works regardless of whether the project has
 * "Automatically expose System Environment Variables" turned on. It is
 * undefined locally, so `isProduction` is also false there.
 */
export const isProduction = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
