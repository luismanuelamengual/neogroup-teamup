import { spawnSync } from 'node:child_process'
import { createSerwistRoute } from '@serwist/turbopack'

/**
 * Serwist route handler (Turbopack integration).
 *
 * Serves the compiled service worker at `/serwist/sw.js` (registered by the
 * <SerwistProvider> in app/layout.tsx). Next.js 16 uses Turbopack, so we use
 * @serwist/turbopack instead of the webpack-based @serwist/next plugin.
 */

// A revision versions the precached shell so stale precached responses are not
// reused after a deploy. `git rev-parse HEAD` is convenient; when git is not
// available (e.g. some serverless builds) we fall back to a random id.
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout ?? crypto.randomUUID()

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  additionalPrecacheEntries: [{ url: '/~offline', revision }],
  swSrc: 'app/sw.ts',
  useNativeEsbuild: true
})
