import { DB } from '@neogroup/neorm'
import { Category } from '@/app/(protected)/(categories)/models/Category'
import { CategoryFilters } from '@/app/(protected)/(categories)/models/CategoryFilters'
import { CategoryInput } from '@/app/(protected)/(categories)/models/CategoryInput'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { getEnabledDisciplines } from '@/app/(protected)/(tournaments)/services/organizations'
import { ApiException } from '@/app/models/ApiException'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'
import { getCurrentOrganizationId } from '@/app/services/organization-context'

/**
 * All the business logic around the category catalogue of an organization:
 * the paginated listing used both by the tournament form's autocomplete
 * (usually filtered by discipline, with a large pageSize — see
 * useCategories.getAllCategories) and by the administrator's "Categorías"
 * ABM (search + pagination), plus the create/update/delete of that ABM.
 *
 * Categories used to be created on the fly by whoever was filling the
 * tournament form, which produced near-duplicates ("4ta", "Cuarta", "4TA")
 * that split the rankings of what is really a single category. They are now
 * defined once here and only ever picked from a selector.
 *
 * A category belongs to a discipline and nothing else: it is a division
 * ("Primera", "4ta"), not a modality. Tennis categories used to be split
 * between singles and doubles, but an interclubes encounter mixes both, so
 * singles-vs-doubles is a property of the tournament and of each match, never
 * of the category (see migration 010).
 *
 * No function here takes an organizationId: every query goes through the
 * Category entity, whose OrganizationScope pins it to the organization of the
 * current operation (see services/organization-context.ts), so a category of
 * another organization is not reachable — a lookup by a foreign id simply
 * finds nothing and 404s. The one places the organization is still named are
 * the inserts in `createCategory` and `resolveCategoryIds`, where it is the
 * value of a column rather than a filter.
 */

/**
 * Paginated listing of the categories of an organization, searchable by name
 * and optionally restricted to a discipline and/or a set of ids (a lookup
 * rather than a search, analogous to `getTournaments` in
 * services/tournaments.ts).
 *
 * Powers both the category autocomplete of the tournament form and the
 * administrator's categories browser — the CategorySelector goes through
 * `useCategories.getAllCategories`, which fixes a large `pageSize` to fetch
 * the whole catalogue of a discipline at once.
 */
export async function getCategories({
  query,
  discipline = null,
  ids,
  page = 1,
  pageSize = 10
}: CategoryFilters = {}): Promise<PaginatedResponse<Category[]>> {
  const categoriesQuery = Category.orderBy('discipline').orderBy('name')
  const normalized = (query ?? '').trim()

  if (discipline != null) {
    categoriesQuery.where('discipline', discipline)
  }

  if (ids && ids.length > 0) {
    categoriesQuery.whereIn('id', ids)
  }

  if (normalized.length > 0) {
    // Explicit ILIKE: neorm's whereLike defaults to a case-sensitive LIKE on
    // PostgreSQL (same caveat as services/users.ts).
    categoriesQuery.where('name', 'ILIKE', `%${normalized}%`)
  }

  return categoriesQuery.paginate(pageSize, page)
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
export async function validateCategoryIds(discipline: Discipline, ids: number[]): Promise<number[]> {
  if (ids.length === 0) {
    return []
  }

  const existing = await Category.where('discipline', discipline).get()
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
export async function resolveCategoryIds(discipline: Discipline, names: string[]): Promise<number[]> {
  if (names.length === 0) {
    return []
  }

  const pool = await Category.where('discipline', discipline).get()
  const ids: number[] = []

  for (const rawName of names) {
    const name = rawName.trim()

    if (name === '') {
      continue
    }

    let category = pool.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase())

    if (!category) {
      category = new Category()
      // An insert applies no scopes, so this is the one place the organization
      // is written rather than filtered by.
      category.organizationId = await getCurrentOrganizationId()
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

/**
 * Validates and normalizes the fields of a category.
 *
 * `currentDiscipline` is the discipline the category already has (omitted for
 * a brand-new one). It is what lets a category grandfathered into a since-disabled
 * discipline keep being renamed: the enabled-catalogue check only applies when
 * `input.discipline` is an actual new choice — a new category, or moving an
 * existing one elsewhere — never to a value that isn't changing.
 */
async function normalizeInput(
  input: CategoryInput,
  currentDiscipline?: Discipline
): Promise<{ name: string; discipline: Discipline }> {
  const name = (input.name ?? '').trim()

  if (!name) {
    throw new ApiException('El nombre de la categoría es obligatorio')
  }

  if (input.discipline !== currentDiscipline) {
    const enabledDisciplines = await getEnabledDisciplines()

    if (!enabledDisciplines.includes(input.discipline)) {
      throw new ApiException('La disciplina seleccionada no está habilitada para esta organización')
    }
  }

  return { name, discipline: input.discipline }
}

/** Finds a category of the organization, or throws a 404. */
async function findCategory(categoryId: number): Promise<Category> {
  const category = await Category.where('id', categoryId).first()

  if (!category) {
    throw new ApiException('Categoría no encontrada', 404)
  }

  return category
}

/**
 * Rejects a name already taken inside the same organization + discipline.
 * Comparison is case-insensitive — allowing "4ta" next to "4TA" would recreate
 * exactly the duplication this ABM exists to remove.
 */
async function assertNameIsAvailable(
  { name, discipline }: { name: string; discipline: Discipline },
  excludedId?: number
): Promise<void> {
  const siblings = await Category.where('discipline', discipline).get()
  const taken = siblings.some(
    (category) => category.id !== excludedId && category.name.toLowerCase() === name.toLowerCase()
  )

  if (taken) {
    throw new ApiException('Ya existe una categoría con ese nombre para esa disciplina')
  }
}

/** Creates a category of the organization. */
export async function createCategory(input: CategoryInput): Promise<Category> {
  const normalized = await normalizeInput(input)

  await assertNameIsAvailable(normalized)

  const category = new Category()

  // An insert applies no scopes, so this is the one place the organization is
  // written rather than filtered by.
  category.organizationId = await getCurrentOrganizationId()
  category.name = normalized.name
  category.discipline = normalized.discipline
  await category.save()

  return category
}

/**
 * Updates a category of the organization.
 *
 * The discipline of a category already used by a tournament or holding ranking
 * points cannot change: doing so would move historical results to a discipline
 * they were never played in. Renaming stays allowed — it is the same category
 * under a better name.
 */
export async function updateCategory(categoryId: number, input: CategoryInput): Promise<Category> {
  const category = await findCategory(categoryId)
  const normalized = await normalizeInput(input, category.discipline)

  if (normalized.discipline !== category.discipline && (await countCategoryReferences(category.id)) > 0) {
    throw new ApiException(
      'La categoría ya se usa en torneos o rankings: podés renombrarla, pero no cambiar su disciplina.'
    )
  }

  await assertNameIsAvailable(normalized, category.id)

  category.name = normalized.name
  category.discipline = normalized.discipline
  await category.save()

  return category
}

/** Number of tournament instances and ranking rows that point at a category. */
async function countCategoryReferences(categoryId: number): Promise<number> {
  const [tournamentCategories, rankings] = await Promise.all([
    DB.table('tournament_categories').where('categoryId', categoryId).count(),
    DB.table('rankings').where('categoryId', categoryId).count()
  ])

  return Number(tournamentCategories) + Number(rankings)
}

/**
 * Permanently deletes a category of the organization.
 *
 * Categories already used by a tournament or holding ranking points are
 * rejected instead of deleted: the foreign key would refuse the DELETE anyway,
 * and removing them would rewrite past results.
 */
export async function deleteCategory(categoryId: number): Promise<void> {
  const category = await findCategory(categoryId)
  const references = await countCategoryReferences(category.id)

  if (references > 0) {
    throw new ApiException(
      'La categoría se usa en torneos o rankings y no puede eliminarse. Podés renombrarla si el nombre ya no aplica.'
    )
  }

  await category.delete()
}
