import { DB, Schema } from '@neogroup/neorm'
import { beforeEach, describe, expect, it } from 'vitest'
import migration010 from '@/database/migrations/010-categories-drop-subdiscipline'
import { createUser, resetDatabase } from '@/tests/setup/harness'

/**
 * The interesting part of migration 010 is not dropping the column (that is one
 * line) but what it does with the rows that only differed by modality: they
 * collapse into a single category, and everything pointing at the losers has to
 * be repointed at the survivor.
 *
 * `resetDatabase()` already applies the migration, so these tests recreate the
 * pre-migration shape by adding the column back before exercising it.
 */
async function restoreLegacyShape(): Promise<void> {
  await Schema.table('categories', (table) => {
    table.integer('subDiscipline').nullable()
  })
}

/** Inserts a legacy category row and returns its id (the newest one inserted). */
async function insertCategory(name: string, discipline: number, subDiscipline: number | null): Promise<number> {
  await DB.table('categories').insert({ organizationId: 1, name, discipline, subDiscipline })

  const rows = await DB.table('categories').select('id').get()

  return Math.max(...rows.map((row) => Number(row.id)))
}

describe('migration 010 — categories lose their sub-discipline', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('drops the column', async () => {
    expect(await Schema.hasColumn('categories', 'subDiscipline')).toBe(false)

    await restoreLegacyShape()
    expect(await Schema.hasColumn('categories', 'subDiscipline')).toBe(true)

    await migration010.up()

    expect(await Schema.hasColumn('categories', 'subDiscipline')).toBe(false)
  })

  it('is idempotent (a second run is a no-op)', async () => {
    await expect(migration010.up()).resolves.not.toThrow()
    await expect(migration010.up()).resolves.not.toThrow()
  })

  it('keeps categories that do not collide', async () => {
    await restoreLegacyShape()
    await insertCategory('Primera', 1, null)
    await insertCategory('Segunda', 1, null)
    // Same name, different discipline: not a collision.
    await insertCategory('Primera', 2, 1)

    await migration010.up()

    const rows = await DB.table('categories').get()

    expect(rows).toHaveLength(3)
  })

  it('merges two categories that only differed by modality', async () => {
    await restoreLegacyShape()

    const singles = await insertCategory('Cuarta', 2, 1)
    const doubles = await insertCategory('Cuarta', 2, 2)

    await migration010.up()

    const rows = await DB.table('categories').get()

    // Only the oldest survives.
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].id)).toBe(singles)
    expect(singles).toBeLessThan(doubles)
  })

  it('merges case-insensitively', async () => {
    await restoreLegacyShape()
    await insertCategory('Cuarta', 2, 1)
    await insertCategory('CUARTA', 2, 2)

    await migration010.up()

    expect(await DB.table('categories').get()).toHaveLength(1)
  })

  it('repoints tournaments and rankings at the surviving category', async () => {
    await restoreLegacyShape()

    const survivor = await insertCategory('Cuarta', 2, 1)
    const merged = await insertCategory('Cuarta', 2, 2)
    // Real rows: both tournaments and rankings hold a foreign key to users.
    const userId = await createUser()

    await DB.table('tournaments').insert({
      organizationId: 1,
      ownerId: userId,
      name: 'T',
      status: 1,
      discipline: 2,
      type: 1,
      scoreFormat: 1,
      startDate: '2026-01-01',
      currency: 'ARS',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    const tournament = await DB.table('tournaments').select('id').first()

    await DB.table('tournament_categories').insert({
      tournamentId: Number(tournament!.id),
      categoryId: merged,
      maxCompetitors: 8
    })
    await DB.table('rankings').insert({
      organizationId: 1,
      categoryId: merged,
      userId,
      points: 100,
      expirationDate: new Date().toISOString(),
      createdAt: new Date().toISOString()
    })

    await migration010.up()

    const instance = await DB.table('tournament_categories').select('categoryId').first()
    const ranking = await DB.table('rankings').select('categoryId').first()

    // The rows that pointed at the deleted duplicate now point at the survivor,
    // so no history is lost and no foreign key is left dangling.
    expect(Number(instance!.categoryId ?? instance!.categoryid)).toBe(survivor)
    expect(Number(ranking!.categoryId ?? ranking!.categoryid)).toBe(survivor)
    expect(await DB.table('categories').get()).toHaveLength(1)
  })
})
