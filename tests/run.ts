/* eslint-disable no-console */
/**
 * In-sandbox test runner. Discovers every *.test.ts under tests/, loads them
 * (their `import { describe, it } from 'vitest'` is redirected to the shim by
 * tests/setup/register.cjs), then executes the collected suites.
 *
 * Usage:  node -r ./tests/setup/register.cjs tests/run.ts [filter]
 *
 * On a normal machine you would instead run `yarn vitest` — the same test files
 * work unchanged there.
 */
import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import { run } from '@/tests/setup/vitest-shim'

const TESTS_DIR = join(__dirname)
const filter = process.argv[2] ?? ''

function findTestFiles(dir: string): string[] {
  const out: string[] = []

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stats = statSync(full)

    if (stats.isDirectory()) {
      // Skip the harness folder, node_modules, and any underscore-prefixed dir
      // (scratch space left over from test authoring).
      if (entry === 'setup' || entry === 'node_modules' || entry.startsWith('_')) {
        continue
      }

      out.push(...findTestFiles(full))
    } else if (entry.endsWith('.test.ts') && !entry.startsWith('_')) {
      out.push(full)
    }
  }

  return out
}

async function main(): Promise<void> {
  const files = findTestFiles(TESTS_DIR)
    .filter((file) => (filter ? file.includes(filter) : true))
    .sort()

  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require(file)
  }

  console.log(`\nLoaded ${files.length} test file(s).`)
  const result = await run()

  console.log('\n──────────────────────────────────────────')
  console.log(`PASSED:  ${result.passed}`)
  console.log(`FAILED:  ${result.failed}`)
  console.log(`SKIPPED: ${result.skipped}`)

  if (result.failures.length > 0) {
    console.log('\nFailures:')

    for (const failure of result.failures) {
      console.log(`  • ${failure.name}`)
    }
  }

  process.exit(result.failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
