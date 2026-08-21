import { beforeEach, describe, expect, it } from 'vitest'
import { createSite, deleteSite, getSites, updateSite, updateSiteData } from '@/app/(protected)/(sites)/services/sites'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { buildTournament, createOrganization, resetDatabase } from '@/tests/setup/harness'

const ORGANIZATION_ID = 1

describe('sites administration', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('creates a site and lists it', async () => {
    await createSite(ORGANIZATION_ID, { name: '  Club Belgrano  ' })

    const { data } = await getSites(ORGANIZATION_ID)

    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('Club Belgrano')
  })

  it('rejects an empty name', async () => {
    await expect(createSite(ORGANIZATION_ID, { name: '   ' })).rejects.toThrow('obligatorio')
  })

  it('rejects a duplicated name regardless of casing', async () => {
    await createSite(ORGANIZATION_ID, { name: 'Club Belgrano' })

    await expect(createSite(ORGANIZATION_ID, { name: 'club belgrano' })).rejects.toThrow('Ya existe')
  })

  it('lets two organizations use the same venue name', async () => {
    const otherOrganizationId = await createOrganization()

    await createSite(ORGANIZATION_ID, { name: 'Club Belgrano' })
    await createSite(otherOrganizationId, { name: 'Club Belgrano' })

    expect((await getSites(ORGANIZATION_ID)).data).toHaveLength(1)
    expect((await getSites(otherOrganizationId)).data).toHaveLength(1)
  })

  it('filters the listing by name', async () => {
    await createSite(ORGANIZATION_ID, { name: 'Club Belgrano' })
    await createSite(ORGANIZATION_ID, { name: 'GEBA' })

    const { data } = await getSites(ORGANIZATION_ID, { query: 'geba' })

    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('GEBA')
  })

  it('renames a site', async () => {
    const site = await createSite(ORGANIZATION_ID, { name: 'Club Belgrano' })

    await updateSite(ORGANIZATION_ID, site.id, { name: 'Racket Club Belgrano' })

    const { data } = await getSites(ORGANIZATION_ID)

    expect(data[0].name).toBe('Racket Club Belgrano')
  })

  it('does not reach a site of another organization', async () => {
    const site = await createSite(await createOrganization(), { name: 'Club Belgrano' })

    await expect(updateSite(ORGANIZATION_ID, site.id, { name: 'Otro' })).rejects.toThrow('no encontrada')
    await expect(deleteSite(ORGANIZATION_ID, site.id)).rejects.toThrow('no encontrada')
  })

  it('deletes an unused site', async () => {
    const site = await createSite(ORGANIZATION_ID, { name: 'Club Belgrano' })

    await deleteSite(ORGANIZATION_ID, site.id)

    expect((await getSites(ORGANIZATION_ID)).data).toHaveLength(0)
  })

  it('refuses to delete a site assigned to a tournament', async () => {
    const site = await createSite(ORGANIZATION_ID, { name: 'Club Belgrano' })
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 2 })

    built.tournament.siteId = site.id
    await built.tournament.save()

    await expect(deleteSite(ORGANIZATION_ID, site.id)).rejects.toThrow('no puede eliminarse')
  })
})

/**
 * The settings document a venue carries (`sites.data`): how many courts it has,
 * how they are named, and the duration it was last planned with.
 *
 * It is the one part of the sites module the organizer writes, and the one
 * column with no schema behind it, so what these check is that whatever the
 * planner sends comes back as something a reader can trust — the published
 * schedule builds its court columns straight from here.
 */
describe('venue settings', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  /** Reads a venue's settings back through the listing, as a client would. */
  const readData = async (siteId: number) => (await getSites(ORGANIZATION_ID)).data.find((s) => s.id === siteId)?.data

  it('stores the courts setup of a venue', async () => {
    const { id } = await createSite(ORGANIZATION_ID, { name: 'Club Belgrano' })

    await updateSiteData(ORGANIZATION_ID, id, { courts: 4, courtNames: { 1: 'Central' }, matchDuration: 90 })

    expect(await readData(id)).toEqual({ courts: 4, courtNames: { 1: 'Central' }, matchDuration: 90 })
  })

  it('starts with no settings at all', async () => {
    const { id } = await createSite(ORGANIZATION_ID, { name: 'Club Belgrano' })

    expect(await readData(id) ?? null).toBeNull()
  })

  it('clamps the courts count to what the planner offers', async () => {
    const { id } = await createSite(ORGANIZATION_ID, { name: 'Club Belgrano' })

    await updateSiteData(ORGANIZATION_ID, id, { courts: 99 })
    expect((await readData(id))?.courts).toBe(12)

    // Below one is not a small venue, it is nonsense: the field is dropped and
    // the reader falls back to its own default.
    await updateSiteData(ORGANIZATION_ID, id, { courts: 0 })
    expect(await readData(id) ?? null).toBeNull()
  })

  it('drops court names that add nothing', async () => {
    const { id } = await createSite(ORGANIZATION_ID, { name: 'Club Belgrano' })

    await updateSiteData(ORGANIZATION_ID, id, {
      courts: 3,
      // Blank, and the very fallback the reader would have used anyway.
      courtNames: { 1: '  ', 2: 'Cancha 2', 3: '  Central  ' }
    })

    expect((await readData(id))?.courtNames).toEqual({ 3: 'Central' })
  })

  it('clears the document when nothing survives', async () => {
    const { id } = await createSite(ORGANIZATION_ID, { name: 'Club Belgrano' })

    await updateSiteData(ORGANIZATION_ID, id, { courts: 4 })
    await updateSiteData(ORGANIZATION_ID, id, null)

    expect(await readData(id) ?? null).toBeNull()
  })

  it('does not reach a venue of another organization', async () => {
    const otherOrganizationId = await createOrganization()
    const { id } = await createSite(otherOrganizationId, { name: 'Club Belgrano' })

    await expect(updateSiteData(ORGANIZATION_ID, id, { courts: 4 })).rejects.toThrow('no encontrada')
  })
})
