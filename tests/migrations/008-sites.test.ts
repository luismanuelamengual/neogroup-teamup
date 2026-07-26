import { DB, Schema, SqliteDataSource } from '@neogroup/neorm'
import { beforeEach, describe, expect, it } from 'vitest'
import migration008 from '@/database/migrations/008-sites'

/**
 * Verifies migration 008 turns the free-text `tournaments.location` into a real
 * `sites` catalogue: one site per distinct venue and organization, tournaments
 * repointed at it through `siteId`, and the old column gone.
 */

const TOURNAMENT_DEFAULTS = {
  status: 1,
  discipline: 1,
  type: 1,
  scoreFormat: 1,
  startDate: '2026-01-01',
  currency: 'ARS',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}

/**
 * Drops every table of the shared test database.
 *
 * SQLite refuses to drop a table while another one still references it, and the
 * in-sandbox runner hands this file whatever schema the previous test file left
 * behind, so the drops run in passes until nothing is left instead of following
 * a hard-coded order.
 */
async function dropEveryTable(): Promise<void> {
  for (let pass = 0; pass < 10; pass++) {
    const tables = await DB.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")

    if (tables.length === 0) {
      return
    }

    for (const table of tables) {
      try {
        await DB.execute(`DROP TABLE IF EXISTS "${String(table.name)}"`)
      } catch {
        // Still referenced by a table this pass has not reached yet.
      }
    }
  }

  throw new Error('could not drop every table of the test database')
}

/**
 * Builds the pre-008 shape of the only three tables the migration touches,
 * mirroring their definition in 001 (including the free-text `location`).
 *
 * The whole schema is dropped first, then just these three are recreated:
 * migration 008 reads `tournaments` and creates `sites`, so replaying the
 * earlier migrations would add nothing but coupling.
 */
async function resetToPreSitesSchema(): Promise<void> {
  if (!(DB.getActiveSource() instanceof SqliteDataSource)) {
    throw new Error('migration sites test must run on throwaway SQLite')
  }

  await dropEveryTable()

  await Schema.createIfNotExists('organizations', (table) => {
    table.increments('id')
    table.string('name', 150)
    table.string('domainName', 100).unique()
    table.timestamp('createdAt').useCurrent()
  })

  await Schema.createIfNotExists('users', (table) => {
    table.increments('id')
    table.integer('organizationId')
    table.string('email', 150)
    table.timestamp('createdAt').useCurrent()

    table.foreign('organizationId').references('id').on('organizations')
  })

  await Schema.createIfNotExists('tournaments', (table) => {
    table.increments('id')
    table.integer('organizationId')
    table.integer('ownerId')
    table.string('name', 150)
    table.integer('status').default(1)
    table.integer('discipline')
    table.integer('type')
    table.integer('scoreFormat')
    table.string('startDate', 10)
    table.string('location', 255).nullable()
    table.string('currency', 3).default('ARS')
    table.timestamp('createdAt').useCurrent()
    table.timestamp('updatedAt').useCurrent()

    table.foreign('organizationId').references('id').on('organizations')
    table.foreign('ownerId').references('id').on('users')
  })
}

/**
 * Two organizations, each with an owner user, so tournaments have valid FKs.
 * The generated ids are read back instead of assumed: the tables are dropped
 * and recreated, but SQLite keeps its AUTOINCREMENT high-water marks.
 */
async function seedOrganizations(): Promise<{ organizationId: number; ownerId: number }[]> {
  const organizations: { organizationId: number; ownerId: number }[] = []

  for (const domain of ['a', 'b']) {
    await DB.table('organizations').insert({
      name: `Org ${domain}`,
      domainName: domain,
      createdAt: new Date().toISOString()
    })

    const organization = await DB.table('organizations').select('id').where('domainName', domain).first()
    const organizationId = Number(organization!.id)

    await DB.table('users').insert({
      organizationId,
      email: `${domain}@${domain}.dev`,
      createdAt: new Date().toISOString()
    })

    const user = await DB.table('users').select('id').where('email', `${domain}@${domain}.dev`).first()

    organizations.push({ organizationId, ownerId: Number(user!.id) })
  }

  return organizations
}

async function insertTournament(
  name: string,
  { organizationId, ownerId }: { organizationId: number; ownerId: number },
  location: string | null
): Promise<void> {
  await DB.table('tournaments').insert({ ...TOURNAMENT_DEFAULTS, organizationId, ownerId, name, location })
}

/** name → siteId of every tournament, read back after the migration. */
async function siteIdByTournament(): Promise<Map<string, number | null>> {
  const rows = await DB.table('tournaments').select('name', 'siteId').get()

  return new Map(rows.map((row) => [String(row.name ?? row.NAME), (row.siteId ?? row.siteid ?? null) as number | null]))
}

describe('migration 008 — tournaments.location → sites', () => {
  let orgA: { organizationId: number; ownerId: number }
  let orgB: { organizationId: number; ownerId: number }

  beforeEach(async () => {
    await resetToPreSitesSchema()
    ;[orgA, orgB] = await seedOrganizations()
  })

  it('creates one site per distinct venue and repoints the tournaments at it', async () => {
    await insertTournament('T1', orgA, 'Club Belgrano')
    await insertTournament('T2', orgA, 'GEBA')

    await migration008.up()

    const sites = await DB.table('sites').orderBy('name').get()
    const byTournament = await siteIdByTournament()

    expect(sites).toHaveLength(2)
    expect(sites.map((site) => String(site.name))).toEqual(['Club Belgrano', 'GEBA'])
    expect(byTournament.get('T1')).not.toBe(byTournament.get('T2'))
    expect(byTournament.get('T1')).not.toBeNull()
  })

  it('collapses spellings that differ only in case or surrounding spaces', async () => {
    await insertTournament('T1', orgA, 'Club Belgrano')
    await insertTournament('T2', orgA, 'club belgrano ')
    await insertTournament('T3', orgA, '  CLUB BELGRANO')

    await migration008.up()

    const sites = await DB.table('sites').get()
    const byTournament = await siteIdByTournament()

    expect(sites).toHaveLength(1)
    // The first spelling found wins as the site name.
    expect(String(sites[0].name)).toBe('Club Belgrano')
    expect(byTournament.get('T2')).toBe(byTournament.get('T1'))
    expect(byTournament.get('T3')).toBe(byTournament.get('T1'))
  })

  it('keeps sites of different organizations apart', async () => {
    await insertTournament('T1', orgA, 'Club Belgrano')
    await insertTournament('T2', orgB, 'Club Belgrano')

    await migration008.up()

    const sites = await DB.table('sites').get()
    const byTournament = await siteIdByTournament()

    expect(sites).toHaveLength(2)
    expect(byTournament.get('T1')).not.toBe(byTournament.get('T2'))
  })

  it('leaves tournaments without a location pointing nowhere', async () => {
    await insertTournament('T1', orgA, null)
    await insertTournament('T2', orgA, '   ')

    await migration008.up()

    const sites = await DB.table('sites').get()
    const byTournament = await siteIdByTournament()

    expect(sites).toHaveLength(0)
    expect(byTournament.get('T1')).toBeNull()
    expect(byTournament.get('T2')).toBeNull()
  })

  it('drops the location column and is idempotent', async () => {
    await insertTournament('T1', orgA, 'GEBA')

    await migration008.up()
    await migration008.up()

    const sites = await DB.table('sites').get()
    const rows = await DB.table('tournaments').get()

    expect(sites).toHaveLength(1)
    expect('location' in rows[0]).toBe(false)
  })
})
