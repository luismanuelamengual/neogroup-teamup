import { Category } from '@/app/(protected)/(tournaments)/models/Category'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { ApiException } from '@/app/models/ApiException'

export interface CategoryQuery {
  discipline: Discipline
}

/**
 * Categories available for an organization + discipline, ordered by name.
 * Powers the category autocomplete in the tournament form.
 *
 * A category is a division of a discipline and nothing else — it carries no
 * singles/doubles modality (see migration 010), so the discipline is the only
 * filter there is.
 */
export async function getCategories({ discipline }: CategoryQuery): Promise<Category[]> {
  return Category.where('discipline', discipline).orderBy('name').get()
}

/** Loads the categories with the given ids (used to resolve a tournament's categoryIds). */
export async function getCategoriesByIds(ids: number[] | null | undefined): Promise<Category[]> {
  if (!ids || ids.length === 0) {
    return []
  }

  return Category.whereIn('id', ids).get()
}

/**
 * Checks that every given id is a category of the organization for that
 * discipline, and returns them de-duplicated, in input order.
 *
 * This is what the tournament form goes through: categories are defined once by
 * the administrator (/categories ABM) and only ever picked from the catalogue,
 * so anything that does not resolve here is a stale or forged id, not a new
 * category to create.
 */
export async function validateCategoryIds(
  organizationId: number,
  discipline: Discipline,
  ids: number[]
): Promise<number[]> {
  if (ids.length === 0) {
    return []
  }

  const existing = await Category.where('organizationId', organizationId).where('discipline', discipline).get()
  const allowed = new Map(existing.map((category) => [category.id, category]))
  const resolved: number[] = []

  for (const id of ids) {
    if (!allowed.has(id)) {
      throw new ApiException('Alguna de las categorías seleccionadas no es válida')
    }

    if (!resolved.includes(id)) {
      resolved.push(id)
    }
  }

  return resolved
}

/**
 * Resolves a list of category names to their ids for a given organization +
 * discipline, creating any category that does not exist yet. Only used by the
 * seed script: the application always picks existing categories through
 * `validateCategoryIds`.
 * Matching is case-insensitive; the returned ids preserve the input order and
 * are de-duplicated.
 */
export async function resolveCategoryIds(
  organizationId: number,
  discipline: Discipline,
  names: string[]
): Promise<number[]> {
  if (names.length === 0) {
    return []
  }

  const pool = await Category.where('organizationId', organizationId).where('discipline', discipline).get()
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
      await category.save()
      pool.push(category)
    }

    if (!ids.includes(category.id)) {
      ids.push(category.id)
    }
  }

  return ids
}
