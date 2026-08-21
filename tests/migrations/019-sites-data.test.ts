import { DB, Schema } from '@neogroup/neorm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Site } from '@/app/(protected)/(sites)/models/Site'
import migration019 from '@/database/migrations/019-sites-data'
import { createSite, resetDatabase } from '@/tests/setup/harness'

/**
 * Migration 019 adds `sites.data`, the JSON document that moves a venue's
 * courts setup out of the organizer's browser and onto the venue itself.
 *
 * It is purely additive, so what is worth pinning down is that the column
 * exists, that it round-trips the document the planner writes (JSONB on
 * PostgreSQL, TEXT on SQLite — the entity's `json` cast has to hide the
 * difference), and that replaying it is harmless.
 *
 * `resetDatabase()` already applies it, so the pre-migration shape is recreated
 * by dropping the column again.
 */
describe('migration 019 — sites.data', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('adds the data column', async () => {
    await Schema.table('sites', (table) => {
      table.dropColumn('data')
    })

    expect(await Schema.hasColumn('sites', 'data')).toBe(false)

    await migration019.up()

    expect(await Schema.hasColumn('sites', 'data')).toBe(true)
  })

  it('is idempotent (a second run is a no-op)', async () => {
    await expect(migration019.up()).resolves.not.toThrow()
    await expect(migration019.up()).resolves.not.toThrow()
  })

  it('leaves existing sites with an empty document', async () => {
    const siteId = await createSite()
    const site = await Site.where('id', siteId).first()

    expect(site?.data ?? null).toBeNull()
  })

  it('round-trips the courts setup the planner writes', async () => {
    const siteId = await createSite()
    const site = (await Site.where('id', siteId).first())!

    site.data = { courts: 4, courtNames: { 2: 'Central' }, matchDuration: 90 }
    await site.save()

    const reloaded = (await Site.where('id', siteId).first())!

    expect(reloaded.data).toEqual({ courts: 4, courtNames: { 2: 'Central' }, matchDuration: 90 })
  })

  it('accepts being cleared back to null', async () => {
    const siteId = await createSite()
    const site = (await Site.where('id', siteId).first())!

    site.data = { courts: 3 }
    await site.save()

    site.data = null
    await site.save()

    expect((await Site.where('id', siteId).first())?.data ?? null).toBeNull()

    // And the row is still there — clearing the settings is not a delete.
    expect(Number(await DB.table('sites').where('id', siteId).count())).toBe(1)
  })
})
