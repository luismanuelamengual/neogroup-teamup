/* eslint-disable no-console */
/**
 * Deletes an organization and everything that hangs off it — tournaments and
 * everything under them (categories, competitors, rounds, matches, payments),
 * users and everything under them (mercadopago accounts, statistics, tokens),
 * catalogue categories, rankings, cached org statistics — then the
 * organization row itself.
 *
 * Unlike db:reset / db:seed, this is meant to be safe to run against ANY
 * database ON PURPOSE, including production (e.g. removing a "demo"
 * organization that ended up seeded there by mistake). It does NOT use the
 * production guard. Instead it protects itself with:
 *
 *   1. A dry run by default — prints exactly what would be deleted, deletes
 *      nothing.
 *   2. Requires --confirm to actually delete.
 *   3. Requires typing the organization's domainName back, so a typo in
 *      --domain can't wipe the wrong organization.
 *
 * Usage:
 *   tsx scripts/delete-organization.ts --domain=demo             (dry run)
 *   tsx scripts/delete-organization.ts --domain=demo --confirm   (deletes)
 */
import { config } from 'dotenv'

config({ path: '.env.local' })
config({ path: '.env' })

import { DB } from '@neogroup/neorm'
import * as readline from 'readline'

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function parseArgs(): { domain?: string; confirm: boolean } {
  const args = process.argv.slice(2)
  const domainArg = args.find((arg) => arg.startsWith('--domain='))

  return {
    domain: domainArg?.slice('--domain='.length),
    confirm: args.includes('--confirm')
  }
}

interface Scope {
  organizationId: number
  tournamentIds: number[]
  tournamentCategoryIds: number[]
  userIds: number[]
  counts: Record<string, number>
}

async function resolveScope(organizationId: number): Promise<Scope> {
  const tournamentIds = (await DB.table('tournaments').select('id').where('organizationId', organizationId).get()).map(
    (row) => row.id as number
  )
  const tournamentCategoryIds =
    tournamentIds.length > 0
      ? (await DB.table('tournament_categories').select('id').whereIn('tournamentId', tournamentIds).get()).map(
          (row) => row.id as number
        )
      : []
  const userIds = (await DB.table('users').select('id').where('organizationId', organizationId).get()).map(
    (row) => row.id as number
  )

  const countWhereIn = async (table: string, column: string, ids: number[]): Promise<number> => {
    if (ids.length === 0) {
      return 0
    }

    return (await DB.table(table).whereIn(column, ids).get()).length
  }

  const countWhere = async (table: string, column: string, value: number): Promise<number> => {
    return (await DB.table(table).where(column, value).get()).length
  }

  const counts: Record<string, number> = {
    tournaments: tournamentIds.length,
    tournament_categories: tournamentCategoryIds.length,
    matches: await countWhereIn('matches', 'tournamentCategoryId', tournamentCategoryIds),
    rounds: await countWhereIn('rounds', 'tournamentCategoryId', tournamentCategoryIds),
    competitors: await countWhereIn('competitors', 'tournamentCategoryId', tournamentCategoryIds),
    tournament_payments: await countWhere('tournament_payments', 'organizationId', organizationId),
    rankings: await countWhere('rankings', 'organizationId', organizationId),
    organization_statistics: await countWhere('organization_statistics', 'organizationId', organizationId),
    categories: await countWhere('categories', 'organizationId', organizationId),
    users: userIds.length,
    mercadopago_accounts: await countWhereIn('mercadopago_accounts', 'userId', userIds),
    player_statistics: await countWhereIn('player_statistics', 'playerId', userIds),
    email_verification_tokens: await countWhereIn('email_verification_tokens', 'userId', userIds),
    password_reset_tokens: await countWhereIn('password_reset_tokens', 'userId', userIds)
  }

  return { organizationId, tournamentIds, tournamentCategoryIds, userIds, counts }
}

async function deleteScope(scope: Scope): Promise<void> {
  const { organizationId, tournamentCategoryIds, userIds } = scope

  await DB.transaction(async () => {
    if (tournamentCategoryIds.length > 0) {
      await DB.table('matches').whereIn('tournamentCategoryId', tournamentCategoryIds).delete()
      await DB.table('rounds').whereIn('tournamentCategoryId', tournamentCategoryIds).delete()
      await DB.table('competitors').whereIn('tournamentCategoryId', tournamentCategoryIds).delete()
    }

    await DB.table('tournament_payments').where('organizationId', organizationId).delete()

    if (tournamentCategoryIds.length > 0) {
      await DB.table('tournament_categories').whereIn('id', tournamentCategoryIds).delete()
    }

    await DB.table('tournaments').where('organizationId', organizationId).delete()
    await DB.table('rankings').where('organizationId', organizationId).delete()
    await DB.table('organization_statistics').where('organizationId', organizationId).delete()

    if (userIds.length > 0) {
      await DB.table('mercadopago_accounts').whereIn('userId', userIds).delete()
      await DB.table('player_statistics').whereIn('playerId', userIds).delete()
      await DB.table('email_verification_tokens').whereIn('userId', userIds).delete()
      await DB.table('password_reset_tokens').whereIn('userId', userIds).delete()
    }

    await DB.table('users').where('organizationId', organizationId).delete()
    await DB.table('categories').where('organizationId', organizationId).delete()
    await DB.table('organizations').where('id', organizationId).delete()
  })
}

async function run(): Promise<void> {
  const { domain, confirm } = parseArgs()

  if (!domain) {
    console.error('Usage: tsx scripts/delete-organization.ts --domain=<domainName> [--confirm]')
    process.exit(1)
  }

  const org = await DB.table('organizations').where('domainName', domain).first()

  if (!org) {
    console.error(`No organization found with domainName="${domain}". Nothing to do.`)
    process.exit(1)
  }

  const organizationId = org.id as number
  const scope = await resolveScope(organizationId)

  console.log(`\nOrganization: id=${organizationId} name="${org.name}" domainName="${org.domainName}"`)
  console.log('Rows that would be deleted:')

  for (const [table, count] of Object.entries(scope.counts)) {
    console.log(`  ${table}: ${count}`)
  }

  console.log('  organizations: 1 (the organization row itself)')

  if (!confirm) {
    console.log('\nDry run only — nothing was deleted. Re-run with --confirm to actually delete.')

    return
  }

  const typed = await prompt(`\nType the domainName ("${domain}") to confirm PERMANENT deletion: `)

  if (typed !== domain) {
    console.error('Confirmation did not match. Aborting — nothing was deleted.')
    process.exit(1)
  }

  await deleteScope(scope)
  console.log(`\nDeleted organization "${domain}" (id=${organizationId}) and all referenced data.`)
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Delete failed:', error)
    process.exit(1)
  })
