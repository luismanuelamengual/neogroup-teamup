import { beforeEach, describe, expect, it } from 'vitest'
import { createSite, deleteSite, getSites, updateSite } from '@/app/(protected)/(sites)/services/sites'
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
