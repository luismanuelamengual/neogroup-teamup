import { DB, Schema } from '@neogroup/neorm'
import { beforeEach, describe, expect, it } from 'vitest'
import migration009 from '@/database/migrations/009-interclubs'
import { resetDatabase } from '@/tests/setup/harness'

/**
 * Migration 009 only adds nullable columns, so the interesting properties are
 * that it creates them, leaves existing rows alone, and can be re-run.
 * `resetDatabase()` already applies it, which is what makes it re-runnable
 * territory from the first assertion on.
 */
describe('migration 009 — interclubs columns', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('adds data + label to competitors', async () => {
    expect(await Schema.hasColumn('competitors', 'data')).toBe(true)
    expect(await Schema.hasColumn('competitors', 'label')).toBe(true)
    // It also added tournament_payments.data, but migration 015 drops that table
    // altogether, so there is nothing left to assert about it here.
    expect(await Schema.hasTable('tournament_payments')).toBe(false)
  })

  it('is idempotent (a second and third run change nothing)', async () => {
    await expect(migration009.up()).resolves.not.toThrow()
    await expect(migration009.up()).resolves.not.toThrow()

    expect(await Schema.hasColumn('competitors', 'label')).toBe(true)
  })

  it('leaves the new columns null for competitors that predate it', async () => {
    await DB.table('organizations').insert({
      name: 'Org',
      domainName: `org-${Date.now()}`,
      createdAt: new Date().toISOString()
    })

    const organization = await DB.table('organizations').select('id').first()
    const organizationId = Number(organization!.id ?? (organization as Record<string, unknown>).id)

    await DB.table('users').insert({
      organizationId,
      email: `legacy-${Date.now()}@test.dev`,
      active: 1,
      emailVerified: 1,
      createdAt: new Date().toISOString()
    })
    await DB.table('tournaments').insert({
      organizationId,
      ownerId: 1,
      name: 'Legacy',
      status: 1,
      discipline: 1,
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
      categoryId: null,
      maxCompetitors: 8
    })

    const category = await DB.table('tournament_categories').select('id').first()

    await DB.table('competitors').insert({
      tournamentCategoryId: Number(category!.id),
      playerIds: JSON.stringify([1]),
      createdAt: new Date().toISOString()
    })

    // Re-running the migration must not touch the row it finds.
    await migration009.up()

    const competitor = await DB.table('competitors').select('data', 'label').first()

    expect(competitor!.data ?? null).toBeNull()
    expect(competitor!.label ?? null).toBeNull()
  })
})
