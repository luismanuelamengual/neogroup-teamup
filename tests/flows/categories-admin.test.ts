import { beforeEach, describe, expect, it } from 'vitest'
import {
  createCategory,
  deleteCategory,
  getCategories,
  updateCategory
} from '@/app/(protected)/(categories)/services/categories'
import { Discipline } from '@/app/(protected)/(disciplines)/models/Discipline'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { Organization } from '@/app/models/Organization'
import { withOrganization } from '@/app/services/organization-context'
import { buildTournament, createOrganization, resetDatabase } from '@/tests/setup/harness'

const ORGANIZATION_ID = 1

describe('categories administration', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('creates a category, trimming its name', async () => {
    const category = await createCategory({ name: '  Cuarta  ', discipline: Discipline.PADEL })

    expect(category.name).toBe('Cuarta')
    expect(category.discipline).toBe(Discipline.PADEL)
  })

  it('creates a tennis category without asking for a modality', async () => {
    // A category is a division of a discipline, not a modality: singles vs
    // doubles belongs to the tournament (and, in interclubes, to each match).
    const category = await createCategory({ name: 'Primera', discipline: Discipline.TENNIS })

    expect(category.name).toBe('Primera')
    expect(category.discipline).toBe(Discipline.TENNIS)
  })

  it('rejects an empty name and an unknown discipline', async () => {
    await expect(createCategory({ name: ' ', discipline: Discipline.PADEL })).rejects.toThrow('obligatorio')
    await expect(createCategory({ name: 'Cuarta', discipline: 99 as Discipline })).rejects.toThrow('disciplina')
  })

  it('rejects a duplicate inside the same discipline but allows it in another one', async () => {
    await createCategory({ name: 'Cuarta', discipline: Discipline.PADEL })

    await expect(createCategory({ name: 'cuarta', discipline: Discipline.PADEL })).rejects.toThrow('Ya existe')

    const tennis = await createCategory({ name: 'Cuarta', discipline: Discipline.TENNIS })

    expect(tennis.id).toBeDefined()
  })

  it('filters the listing by discipline and name', async () => {
    await createCategory({ name: 'Cuarta', discipline: Discipline.PADEL })
    await createCategory({ name: 'Quinta', discipline: Discipline.PADEL })
    await createCategory({ name: 'Cuarta', discipline: Discipline.TENNIS })

    expect((await getCategories()).data).toHaveLength(3)
    expect((await getCategories({ discipline: Discipline.TENNIS })).data).toHaveLength(1)
    expect((await getCategories({ query: 'quin' })).data).toHaveLength(1)
  })

  it('renames a category', async () => {
    const category = await createCategory({ name: 'Cuarta', discipline: Discipline.PADEL })

    await updateCategory(category.id, { name: '4ta', discipline: Discipline.PADEL })

    const { data } = await getCategories()

    expect(data[0].name).toBe('4ta')
  })

  it('rejects a discipline the organization has disabled, but keeps grandfathering an existing category into it', async () => {
    const category = await createCategory({ name: 'Cuarta', discipline: Discipline.PADEL })
    // The organization drops padel — only tennis stays enabled.
    const organization = await Organization.where('id', ORGANIZATION_ID).first()

    organization!.enabledDisciplines = [Discipline.TENNIS]
    await organization!.save()

    // A brand-new category can no longer be created in the now-disabled discipline.
    await expect(createCategory({ name: 'Quinta', discipline: Discipline.PADEL })).rejects.toThrow('no está habilitada')

    // Renaming the existing padel category *without* touching its (now
    // disabled) discipline must keep working — it is the same category under
    // a better name, same rule as one already referenced by a tournament.
    await updateCategory(category.id, { name: '4ta', discipline: Discipline.PADEL })

    expect((await getCategories()).data[0].name).toBe('4ta')

    // Actively moving it to a *different* discipline the organization doesn't
    // offer is still rejected.
    await expect(updateCategory(category.id, { name: '4ta', discipline: 99 as Discipline })).rejects.toThrow(
      'no está habilitada'
    )
  })

  it('does not reach a category of another organization', async () => {
    const otherOrganizationId = await createOrganization()
    // Acting for the other organization, the way the cron states the tenant of
    // each tournament: the harness leaves every test in organization 1, and
    // createCategory reads organization-scoped models.
    const category = await withOrganization(otherOrganizationId, () =>
      createCategory({
        name: 'Cuarta',
        discipline: Discipline.PADEL
      })
    )

    await expect(updateCategory(category.id, { name: 'Otra', discipline: Discipline.PADEL })).rejects.toThrow(
      'no encontrada'
    )
    await expect(deleteCategory(category.id)).rejects.toThrow('no encontrada')
  })

  it('deletes an unused category', async () => {
    const category = await createCategory({ name: 'Cuarta', discipline: Discipline.PADEL })

    await deleteCategory(category.id)

    expect((await getCategories()).data).toHaveLength(0)
  })

  it('refuses to delete or re-classify a category already used by a tournament', async () => {
    const category = await createCategory({ name: 'Cuarta', discipline: Discipline.PADEL })
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 2 })
    const instance = await TournamentCategory.where('tournamentId', built.tournament.id).first()

    instance!.categoryId = category.id
    await instance!.save()

    await expect(deleteCategory(category.id)).rejects.toThrow('no puede eliminarse')
    await expect(updateCategory(category.id, { name: 'Cuarta', discipline: Discipline.TENNIS })).rejects.toThrow(
      'no cambiar su disciplina'
    )

    // Renaming it stays allowed — it is the same category under a better name.
    await updateCategory(category.id, { name: '4ta', discipline: Discipline.PADEL })

    expect((await getCategories()).data[0].name).toBe('4ta')
  })
})
