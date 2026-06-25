/* eslint-disable */
/**
 * Lightweight TypeScript loader for running the tournament engine in tests
 * WITHOUT Next.js. It transpiles .ts on the fly with the TypeScript compiler
 * (decorators + emitDecoratorMetadata), resolves the `@/` path alias, and stubs
 * the Next.js / next-auth / react modules that the model layer pulls in at
 * import time (none of which are needed to exercise the tournament logic).
 *
 * This file is plain CommonJS so it can be loaded with `node -r`.
 */
const fs = require('fs')
const path = require('path')
const Module = require('module')
const ts = require('typescript')

const ROOT = path.resolve(__dirname, '..', '..')

// Default the test DB to in-memory SQLite (neorm configures lazily on first use,
// so setting it here — before any DB call — is enough).
process.env.DB_DRIVER = process.env.DB_DRIVER || 'sqlite'
process.env.DB_URL = process.env.DB_URL || 'sqlite://:memory:'

// ── 1. Resolve the `@/` path alias ───────────────────────────────────────────
require('tsconfig-paths').register({
  baseUrl: ROOT,
  paths: { '@/*': ['./*'] },
  addMatchAll: false
})

// ── 2. Stub Next.js / next-auth / react / the auth service ───────────────────
// These execute side-effectful module-level code (NextAuth({...}), server-only
// guards, etc.) that throws outside a Next runtime. The tournament engine never
// touches them, so empty/inert stubs are enough.
const authSession = { value: null } // tests can flip this to simulate a session
const STUBS = new Map()

function makeStub(extra) {
  return Object.assign(
    {
      __esModule: true,
      default: function () {},
      getSession: async () => authSession.value
    },
    extra || {}
  )
}

const reactStub = makeStub({
  cache: (fn) => fn
})

STUBS.set('react', reactStub)
STUBS.set('server-only', makeStub())
STUBS.set('next/headers', makeStub({ headers: async () => new Map(), cookies: async () => new Map() }))
STUBS.set('next/server', makeStub({ NextResponse: class {}, NextRequest: class {} }))
STUBS.set('next-auth', makeStub())
STUBS.set('next-auth/providers/credentials', makeStub())
STUBS.set('next-auth/providers/google', makeStub())

// Intercept bare specifiers and the auth service file (resolved to absolute).
const AUTH_SERVICE = path.join(ROOT, 'app', '(auth)', 'services', 'auth.ts')
const AUTH_CONFIG = path.join(ROOT, 'app', '(auth)', 'services', 'auth.config.ts')

const AUTH_STUB = path.join(__dirname, 'stubs', 'auth-service.ts')
let vitestShim = null

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  // Redirect the `vitest` import to the in-sandbox shim (lazily, so the .ts
  // require hook below is already registered by the time it is needed).
  if (request === 'vitest') {
    if (!vitestShim) {
      vitestShim = require(path.join(__dirname, 'vitest-shim.ts'))
    }

    return vitestShim
  }

  if (STUBS.has(request)) {
    return STUBS.get(request)
  }

  if (request.startsWith('next-auth/')) {
    return makeStub()
  }

  // Stub the auth service no matter how it is referenced (relative or aliased).
  if (parent) {
    try {
      const resolved = Module._resolveFilename(request, parent, isMain)

      if (resolved === AUTH_SERVICE || resolved === AUTH_CONFIG) {
        return require(AUTH_STUB)
      }
    } catch (_) {
      // fall through to the real loader
    }
  }

  return originalLoad.apply(this, arguments)
}

// ── 2b. Coerce SQLite bindings (test harness only) ───────────────────────────
// node:sqlite cannot bind JS booleans or Date objects. neorm's entity layer
// casts columns, but raw query-builder UPDATEs (e.g. setFrontier's
// `.update({ active: false })`) pass values straight through. Production runs on
// PostgreSQL where booleans/dates are native; in the SQLite test DB we coerce at
// the driver boundary so the same code paths run unchanged.
function coerceBinding(value) {
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value === undefined) {
    return null
  }

  return value
}

try {
  // Require by absolute path: the package's `exports` map blocks deep subpath
  // specifiers, but a direct file path bypasses it.
  const sqlitePath = path.join(
    ROOT,
    'node_modules',
    '@neogroup',
    'neorm',
    'dist',
    'database',
    'sources',
    'sqlite',
    'SqliteConnection.js'
  )
  const { SqliteConnection } = require(sqlitePath)
  const wrap = (method) => {
    const original = SqliteConnection.prototype[method]

    SqliteConnection.prototype[method] = function (sql, bindings) {
      return original.call(this, sql, Array.isArray(bindings) ? bindings.map(coerceBinding) : bindings)
    }
  }

  wrap('query')
  wrap('execute')
} catch (error) {
  // Only relevant when running on SQLite; ignore if the module layout differs.
}

// ── 3. Transpile .ts on the fly ──────────────────────────────────────────────
const COMPILER_OPTIONS = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
  esModuleInterop: true,
  allowJs: true,
  resolveJsonModule: true,
  jsx: ts.JsxEmit.ReactJSX,
  useDefineForClassFields: false
}

function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: COMPILER_OPTIONS,
    fileName: filename
  })

  module._compile(outputText, filename)
}

require.extensions['.ts'] = compileTs
require.extensions['.tsx'] = compileTs

module.exports = { authSession, ROOT }
