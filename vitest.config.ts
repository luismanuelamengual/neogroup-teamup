import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Vitest configuration for the tournament engine tests.
 *
 * The tests import the real models/services, which transitively load
 * app/(auth)/services/auth.ts (it calls NextAuth({...}) at import time) and a few
 * Next.js runtime modules. None of that is needed to exercise the tournament
 * logic, so they are replaced with inert stubs:
 *   - the auth service is stubbed via a resolveId plugin, because it is imported
 *     through different specifiers (aliased `@/...` AND relative `../...`) that a
 *     plain alias cannot all catch;
 *   - the Next.js / next-auth modules are aliased to an empty stub as a fallback.
 *
 * The DB is an in-memory SQLite database (see tests/setup/vitest.setup.ts).
 * Decorators are handled by Vitest's transformer using the project tsconfig.json
 * (experimentalDecorators / useDefineForClassFields).
 *
 * Run with:  yarn test         (one-shot)
 *            yarn test:watch   (watch mode)
 */
const root = __dirname
const authStub = path.resolve(root, 'tests/setup/stubs/auth-service.ts')
const emptyStub = path.resolve(root, 'tests/setup/stubs/empty.ts')

/** Replaces the NextAuth-backed auth service with a stub, however it is imported. */
function stubAuthService() {
  return {
    name: 'stub-auth-service',
    enforce: 'pre' as const,
    resolveId(source: string) {
      const normalized = source.replace(/\\/g, '/')

      if (normalized.endsWith('(auth)/services/auth')) {
        return authStub
      }

      if (normalized.endsWith('(auth)/services/auth.config')) {
        return emptyStub
      }

      return null
    }
  }
}

export default defineConfig({
  plugins: [stubAuthService()],
  resolve: {
    alias: [
      { find: 'next/headers', replacement: emptyStub },
      { find: 'next/server', replacement: emptyStub },
      { find: 'next-auth/providers/credentials', replacement: emptyStub },
      { find: 'next-auth/providers/google', replacement: emptyStub },
      { find: 'next-auth', replacement: emptyStub },
      { find: 'server-only', replacement: emptyStub },
      { find: /^@\/(.*)$/, replacement: path.resolve(root, '$1') }
    ]
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Ignore underscore-prefixed scratch files left over from test authoring.
    exclude: ['**/node_modules/**', 'tests/**/_*'],
    setupFiles: ['tests/setup/vitest.setup.ts'],
    fileParallelism: false, // shared in-memory SQLite ⇒ run files serially
    testTimeout: 20000,
    hookTimeout: 20000
  }
})
