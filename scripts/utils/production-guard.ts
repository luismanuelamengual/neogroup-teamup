/* eslint-disable no-console */
/**
 * Safety guard against accidentally running destructive database scripts
 * (db:reset, db:seed) against the production database.
 *
 * The target database is identified by the Supabase project ref, not by
 * hostname — Supabase's connection pooler host (e.g.
 * aws-1-us-east-1.pooler.supabase.com) is shared across every project in a
 * region, so a staging project can resolve to the exact same host as
 * production. The project ref is what actually distinguishes them, and it is
 * embedded in the pooler username: `postgres.<project-ref>`.
 *
 * To run a guarded script against production on purpose (e.g. a one-off
 * maintenance task), re-run it with:
 *
 *   ALLOW_PROD_DB_SCRIPT=I_UNDERSTAND yarn run db:reset
 *
 * You will still be asked to type the project ref back to confirm.
 */
import * as readline from 'readline'

// Project ref(s) of the production Supabase database. Add to this list if
// the production project is ever migrated/recreated.
const PRODUCTION_PROJECT_REFS = ['eiipkdlvveyxnvtvvvgy']

function extractProjectRef(): string | null {
  const url = process.env.DB_URL
  const usernameFromUrl = url?.match(/^[a-z]+:\/\/([^:/@]+):/)?.[1]
  const username = usernameFromUrl ?? process.env.DB_USERNAME

  return username?.match(/^postgres\.(.+)$/)?.[1] ?? null
}

/** Connection target for display, with any credentials redacted. */
function targetDescription(): string {
  const url = process.env.DB_URL

  if (url) {
    return url.replace(/^([a-z]+:\/\/)([^:/@]+):[^@]+@/, '$1$2:***@')
  }

  return `host=${process.env.DB_HOST ?? '?'} db=${process.env.DB_NAME ?? '?'}`
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

/**
 * Call at the top of any script that mutates or destroys data. Exits the
 * process if the configured database is production and the override was not
 * confirmed.
 */
export async function assertNotProduction(scriptName: string): Promise<void> {
  const ref = extractProjectRef()

  if (!ref || !PRODUCTION_PROJECT_REFS.includes(ref)) {
    return
  }

  console.error(`\n🚫 "${scriptName}" refuses to run: this is the PRODUCTION database.`)
  console.error(`   Target: ${targetDescription()}\n`)

  if (process.env.ALLOW_PROD_DB_SCRIPT !== 'I_UNDERSTAND') {
    console.error(
      '   If you really mean to do this, re-run with:\n' +
        `     ALLOW_PROD_DB_SCRIPT=I_UNDERSTAND yarn run ${scriptName}\n` +
        '   You will be asked to confirm the project ref.\n'
    )
    process.exit(1)
  }

  const answer = await prompt(`   Override detected. Type the project ref (${ref}) to confirm: `)

  if (answer !== ref) {
    console.error('   Confirmation did not match. Aborting.')
    process.exit(1)
  }

  console.warn('   Confirmed — proceeding against PRODUCTION.\n')
}
