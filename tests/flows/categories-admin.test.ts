import { beforeEach, describe, expect, it } from 'vitest'
import {
  createCategory,
  deleteCategory,
  getManagedCategories,
  updateCategory
} from '@/app/(protected)/(categories)/services/categories'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { buildTournament, createOrganization, resetDatabase } from '@/tests/setup/harness'

const ORGANIZATION_ID = 1

describe('categories administration', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('creates a padel category with no sub-discipline', async () => {
    const category = await createCategory(ORGANIZATION_ID, { name: '  Cuarta  ', discipline: Discipline.PADEL })

    expect(category.name).toBe('Cuarta')
    expect(category.subDiscipline).toBeNull()
  })

  it('forces a sub-discipline on tennis categories', async () => {
    await expect(createCategory(ORGANIZATION_ID, { name: 'Cuarta', discipline: Discipline.TENNIS })).rejects.toThrow(
      'modalidad'
    )

    const category = await createCategory(ORGANIZATION_ID, {
      name: 'Cuarta',
      discipline: Discipline.TENNIS,
      subDiscipline: SubDiscipline.DOUBLES
    })

    expect(category.subDiscipline).toBe(SubDiscipline.DOUBLES)
  })

  it('rejects an empty name and an unknown discipline', async () => {
    await expect(createCategory(ORGANIZATION_ID, { name: ' ', discipline: Discipline.PADEL })).rejects.toThrow(
      'obligatorio'
    )
    await expect(createCategory(ORGANIZATION_ID, { name: 'Cuarta', discipline: 99 as Discipline })).rejects.toThrow(
      'disciplina'
    )
  })

  it('rejects a duplicate inside the same discipline but allows it in another one', async () => {
    await createCategory(ORGANIZATION_ID, { name: 'Cuarta', discipline: Discipline.PADEL })

    await expect(createCategory(ORGANIZATION_ID, { name: 'cuarta', discipline: Discipline.PADEL })).rejects.toThrow(
      'Ya existe'
    )

    const tennis = await createCategory(ORGANIZATION_ID, {
      name: 'Cuarta',
      discipline: Discipline.TENNIS,
      subDiscipline: SubDiscipline.SINGLES
    })

    expect(tennis.id).toBeDefined()
  })

  it('filters the listing by discipline and name', async () => {
    await createCategory(ORGANIZATION_ID, { name: 'Cuarta', discipline: Discipline.PADEL })
    await createCategory(ORGANIZATION_ID, { name: 'Quinta', discipline: Discipline.PADEL })
    await createCategory(ORGANIZATION_ID, {
      name: 'Cuarta',
      discipline: Discipline.TENNIS,
      subDiscipline: SubDiscipline.SINGLES
    })

    expect((await getManagedCategories(ORGANIZATION_ID)).data).toHaveLength(3)
    expect((await getManagedCategories(ORGANIZATION_ID, { discipline: Discipline.TENNIS })).data).toHaveLength(1)
    expect((await getManagedCategories(ORGANIZATION_ID, { query: 'quin' })).data).toHaveLength(1)
  })

  it('renames a category', async () => {
    const category = await createCategory(ORGANIZATION_ID, { name: 'Cuarta', discipline: Discipline.PADEL })

    await updateCategory(ORGANIZATION_ID, category.id, { name: '4ta', discipline: Discipline.PADEL })

    const { data } = await getManagedCategories(ORGANIZATION_ID)

    expect(data[0].name).toBe('4ta')
  })

  it('does not reach a category of another organization', async () => {
    const category = await createCategory(await createOrganization(), {
      name: 'Cuarta',
      discipline: Discipline.PADEL
    })

    await expect(
      updateCategory(ORGANIZATION_ID, category.id, { name: 'Otra', discipline: Discipline.PADEL })
    ).rejects.toThrow('no encontrada')
    await expect(deleteCategory(ORGANIZATION_ID, category.id)).rejects.toThrow('no encontrada')
  })

  it('deletes an unused category', async () => {
    const category = await createCategory(ORGANIZATION_ID, { name: 'Cuarta', discipline: Discipline.PADEL })

    await deleteCategory(ORGANIZATION_ID, category.id)

    expect((await getManagedCategories(ORGANIZATION_ID)).data).toHaveLength(0)
  })

  it('refuses to delete or re-classify a category already used by a tournament', async () => {
    const category = await createCategory(ORGANIZATION_ID, { name: 'Cuarta', discipline: Discipline.PADEL })
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 2 })
    const instance = await TournamentCategory.where('tournamentId', built.tournament.id).first()

    instance!.categoryId = category.id
    await instance!.save()

    await expect(deleteCategory(ORGANIZATION_ID, category.id)).rejects.toThrow('no puede eliminarse')
    await expect(
      updateCategory(ORGANIZATION_ID, category.id, {
        name: 'Cuarta',
        discipline: Discipline.TENNIS,
        subDiscipline: SubDiscipline.SINGLES
      })
    ).rejects.toThrow('no cambiar su disciplina')

    // Renaming it stays allowed — it is the same category under a better name.
    await updateCategory(ORGANIZATION_ID, category.id, { name: '4ta', discipline: Discipline.PADEL })

    expect((await getManagedCategories(ORGANIZATION_ID)).data[0].name).toBe('4ta')
  })
})
