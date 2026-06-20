import { Category } from '@/app/(protected)/(tournaments)/models/Category'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'

export interface CategoryQuery {
  organizationId: number
  discipline: Discipline
  subDiscipline?: SubDiscipline | null
}

/**
 * Categories available for an organization + discipline + sub-discipline,
 * ordered by name. Powers the category autocomplete in the tournament form.
 */
export async function getCategories({ organizationId, discipline, subDiscipline }: CategoryQuery): Promise<Category[]> {
  const sub = subDiscipline ?? null
  const categories = await Category.where('organizationId', organizationId)
    .where('discipline', discipline)
    .orderBy('name')
    .get()

  return categories.filter((category) => (category.subDiscipline ?? null) === sub)
}

/** Loads the categories with the given ids (used to resolve a tournament's categoryIds). */
export async function getCategoriesByIds(ids: number[] | null | undefined): Promise<Category[]> {
  if (!ids || ids.length === 0) {
    return []
  }

  return Category.whereIn('id', ids).get()
}

/**
 * Resolves a list of category names to their ids for a given organization +
 * discipline + sub-discipline, creating any category that does not exist yet.
 * Matching is case-insensitive; the returned ids preserve the input order and
 * are de-duplicated.
 */
export async function resolveCategoryIds(
  organizationId: number,
  discipline: Discipline,
  subDiscipline: SubDiscipline | null,
  names: string[]
): Promise<number[]> {
  if (names.length === 0) {
    return []
  }

  const sub = subDiscipline ?? null
  const existing = await Category.where('organizationId', organizationId).where('discipline', discipline).get()
  const pool = existing.filter((category) => (category.subDiscipline ?? null) === sub)
  const ids: number[] = []

  for (const rawName of names) {
    const name = rawName.trim()

    if (name === '') {
      continue
    }

    let category = pool.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase())

    if (!category) {
      category = new Category()
      category.organizationId = organizationId
      category.name = name
      category.discipline = discipline
      category.subDiscipline = sub
      await category.save()
      pool.push(category)
    }

    if (!ids.includes(category.id)) {
      ids.push(category.id)
    }
  }

  return ids
}
