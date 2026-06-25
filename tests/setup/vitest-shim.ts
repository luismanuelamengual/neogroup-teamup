/* eslint-disable */
/**
 * Minimal Vitest-compatible API used to run the test files in this sandbox,
 * where the real `vitest` package cannot be installed. The test files import
 * `{ describe, it, expect, beforeAll, ... }` from 'vitest'; in the sandbox the
 * loader (tests/setup/register.cjs) redirects that specifier here. On a normal
 * machine `yarn add -D vitest` makes this shim irrelevant — the same files run
 * unchanged under real Vitest.
 *
 * Implemented: describe/it(.skip)/test, expect with the common matchers,
 * beforeAll/afterAll/beforeEach/afterEach (with nested-suite scoping), and an
 * async `run()` that the sandbox runner calls.
 */

type Fn = () => void | Promise<void>

interface TestCase {
  name: string
  fn: Fn
  skip: boolean
}

interface Suite {
  name: string
  parent: Suite | null
  tests: TestCase[]
  suites: Suite[]
  beforeAll: Fn[]
  afterAll: Fn[]
  beforeEach: Fn[]
  afterEach: Fn[]
}

function makeSuite(name: string, parent: Suite | null): Suite {
  return { name, parent, tests: [], suites: [], beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] }
}

const rootSuite = makeSuite('root', null)
let currentSuite = rootSuite

export function describe(name: string, fn: Fn): void {
  const suite = makeSuite(name, currentSuite)

  currentSuite.suites.push(suite)
  const previous = currentSuite

  currentSuite = suite
  // describe bodies are synchronous in these tests.
  fn()
  currentSuite = previous
}

describe.skip = function (name: string, _fn: Fn): void {
  const suite = makeSuite(name + ' (skipped)', currentSuite)

  currentSuite.suites.push(suite)
}

export function it(name: string, fn: Fn): void {
  currentSuite.tests.push({ name, fn, skip: false })
}

it.skip = function (name: string, fn: Fn): void {
  currentSuite.tests.push({ name, fn, skip: true })
}

export const test = it

export function beforeAll(fn: Fn): void {
  currentSuite.beforeAll.push(fn)
}

export function afterAll(fn: Fn): void {
  currentSuite.afterAll.push(fn)
}

export function beforeEach(fn: Fn): void {
  currentSuite.beforeEach.push(fn)
}

export function afterEach(fn: Fn): void {
  currentSuite.afterEach.push(fn)
}

// ── expect ───────────────────────────────────────────────────────────────────
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }

  if (typeof a !== typeof b) {
    return false
  }

  if (a && b && typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) {
      return false
    }

    const ka = Object.keys(a as object)
    const kb = Object.keys(b as object)

    if (ka.length !== kb.length) {
      return false
    }

    return ka.every((k) => deepEqual((a as any)[k], (b as any)[k]))
  }

  return false
}

function fmt(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

class Assertion {
  constructor(
    private actual: unknown,
    private negated = false
  ) {}

  private check(pass: boolean, message: string): void {
    if (this.negated ? pass : !pass) {
      throw new Error(message)
    }
  }

  get not(): Assertion {
    return new Assertion(this.actual, !this.negated)
  }

  toBe(expected: unknown): void {
    this.check(this.actual === expected, `expected ${fmt(this.actual)} ${this.negated ? 'not ' : ''}to be ${fmt(expected)}`)
  }

  toEqual(expected: unknown): void {
    this.check(deepEqual(this.actual, expected), `expected ${fmt(this.actual)} ${this.negated ? 'not ' : ''}to equal ${fmt(expected)}`)
  }

  toBeNull(): void {
    this.check(this.actual === null, `expected ${fmt(this.actual)} ${this.negated ? 'not ' : ''}to be null`)
  }

  toBeUndefined(): void {
    this.check(this.actual === undefined, `expected ${fmt(this.actual)} to be undefined`)
  }

  toBeDefined(): void {
    this.check(this.actual !== undefined, `expected value to be defined`)
  }

  toBeTruthy(): void {
    this.check(!!this.actual, `expected ${fmt(this.actual)} ${this.negated ? 'not ' : ''}to be truthy`)
  }

  toBeFalsy(): void {
    this.check(!this.actual, `expected ${fmt(this.actual)} ${this.negated ? 'not ' : ''}to be falsy`)
  }

  toContain(item: unknown): void {
    const arr = this.actual as any
    const pass = typeof arr?.includes === 'function' ? arr.includes(item) : false

    this.check(pass, `expected ${fmt(this.actual)} ${this.negated ? 'not ' : ''}to contain ${fmt(item)}`)
  }

  toHaveLength(len: number): void {
    const actualLen = (this.actual as any)?.length

    this.check(actualLen === len, `expected length ${actualLen} ${this.negated ? 'not ' : ''}to be ${len}`)
  }

  toBeGreaterThan(n: number): void {
    this.check((this.actual as number) > n, `expected ${fmt(this.actual)} ${this.negated ? 'not ' : ''}to be > ${n}`)
  }

  toBeGreaterThanOrEqual(n: number): void {
    this.check((this.actual as number) >= n, `expected ${fmt(this.actual)} ${this.negated ? 'not ' : ''}to be >= ${n}`)
  }

  toBeLessThan(n: number): void {
    this.check((this.actual as number) < n, `expected ${fmt(this.actual)} ${this.negated ? 'not ' : ''}to be < ${n}`)
  }

  toBeLessThanOrEqual(n: number): void {
    this.check((this.actual as number) <= n, `expected ${fmt(this.actual)} ${this.negated ? 'not ' : ''}to be <= ${n}`)
  }

  toThrow(expected?: string | RegExp): void {
    let threw = false
    let error: unknown = null

    try {
      ;(this.actual as Fn)()
    } catch (e) {
      threw = true
      error = e
    }

    if (this.negated) {
      this.check(threw, `expected function not to throw but it threw ${fmt(String(error))}`)

      return
    }

    if (!threw) {
      throw new Error('expected function to throw, but it did not')
    }

    if (expected) {
      const msg = error instanceof Error ? error.message : String(error)
      const ok = expected instanceof RegExp ? expected.test(msg) : msg.includes(expected)

      if (!ok) {
        throw new Error(`expected error "${msg}" to match ${fmt(expected)}`)
      }
    }
  }

  get rejects() {
    const actual = this.actual
    const negated = this.negated

    return {
      async toThrow(expected?: string | RegExp): Promise<void> {
        let threw = false
        let error: unknown = null

        try {
          await (typeof actual === 'function' ? (actual as Fn)() : actual)
        } catch (e) {
          threw = true
          error = e
        }

        if (negated) {
          if (threw) {
            throw new Error(`expected promise not to reject but it rejected with ${fmt(String(error))}`)
          }

          return
        }

        if (!threw) {
          throw new Error('expected promise to reject, but it resolved')
        }

        if (expected) {
          const msg = error instanceof Error ? error.message : String(error)
          const ok = expected instanceof RegExp ? expected.test(msg) : msg.includes(expected)

          if (!ok) {
            throw new Error(`expected rejection "${msg}" to match ${fmt(expected)}`)
          }
        }
      }
    }
  }
}

export function expect(actual: unknown): Assertion {
  return new Assertion(actual)
}

// ── runner ───────────────────────────────────────────────────────────────────
export interface RunResult {
  passed: number
  failed: number
  skipped: number
  failures: { name: string; error: string }[]
}

function ancestry(suite: Suite): Suite[] {
  const chain: Suite[] = []
  let node: Suite | null = suite

  while (node && node !== rootSuite) {
    chain.unshift(node)
    node = node.parent
  }

  return chain
}

async function runSuite(suite: Suite, prefix: string, result: RunResult): Promise<void> {
  for (const hook of suite.beforeAll) {
    await hook()
  }

  for (const testCase of suite.tests) {
    const fullName = `${prefix} > ${testCase.name}`

    if (testCase.skip) {
      result.skipped++
      // eslint-disable-next-line no-console
      console.log(`  ○ SKIP ${fullName}`)
      continue
    }

    const chain = ancestry(suite)

    try {
      for (const s of chain) {
        for (const hook of s.beforeEach) {
          await hook()
        }
      }

      await testCase.fn()

      for (const s of [...chain].reverse()) {
        for (const hook of s.afterEach) {
          await hook()
        }
      }

      result.passed++
      // eslint-disable-next-line no-console
      console.log(`  ✓ ${fullName}`)
    } catch (error) {
      result.failed++
      const message = error instanceof Error ? (error.stack ?? error.message) : String(error)

      result.failures.push({ name: fullName, error: message })
      // eslint-disable-next-line no-console
      console.log(`  ✗ FAIL ${fullName}\n      ${message.split('\n').slice(0, 4).join('\n      ')}`)
    }
  }

  for (const child of suite.suites) {
    await runSuite(child, `${prefix} > ${child.name}`.replace(/^ > /, ''), result)
  }

  for (const hook of suite.afterAll) {
    await hook()
  }
}

export async function run(): Promise<RunResult> {
  const result: RunResult = { passed: 0, failed: 0, skipped: 0, failures: [] }

  for (const child of rootSuite.suites) {
    // eslint-disable-next-line no-console
    console.log(`\n▶ ${child.name}`)
    await runSuite(child, child.name, result)
  }

  return result
}

export const vi = {
  fn:
    (impl?: (...args: any[]) => any) =>
    (...args: any[]) =>
      impl?.(...args)
}

export default { describe, it, test, expect, beforeAll, afterAll, beforeEach, afterEach, run, vi }
