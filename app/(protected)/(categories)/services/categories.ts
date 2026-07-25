import { DB } from '@neogroup/neorm'
import { CategoryFilters } from '@/app/(protected)/(categories)/models/CategoryFilters'
import { CategoryInput } from '@/app/(protected)/(categories)/models/CategoryInput'
import { Category } from '@/app/(protected)/(tournaments)/models/Category'
import { Discipline, Disciplines } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline, SubDisciplines } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { ApiException } from '@/app/models/ApiException'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'

/**
 * Administration of the category catalogue of an organization — the ABM behind
 * the administrator's "Categorías" page.
 *
 * Categories used to be created on the fly by whoever was filling the
 * tournament form, which produced near-duplicates ("4ta", "Cuarta", "4TA")
 * that split the rankings of what is really a single category. They are now
 * defined once here and only ever picked from a selector.
 *
 * A category belongs to a discipline, and — for tennis only — to a
 * sub-discipline (singles / doubles); padel is always played in doubles, so its
 * categories store `subDiscipline = null`.
 */

/** Validates and normalizes the fields of a category. */
function normalizeInput(input: CategoryInput): {
  name: string
  discipline: Discipline
  subDiscipline: SubDiscipline | null
} {
  const name = (input.name ?? '').trim()

  if (!name) {
    throw new ApiException('El nombre de la categoría es obligatorio')
  }

  if (!Disciplines.includes(input.discipline)) {
    throw new ApiException('La disciplina seleccionada no es válida')
  }

  // Only tennis distinguishes singles from doubles.
  if (input.discipline !== Discipline.TENNIS) {
    return { name, discipline: input.discipline, subDiscipline: null }
  }

  if (!input.subDiscipline || !SubDisciplines.includes(input.subDiscipline)) {
    throw new ApiException('La modalidad seleccionada no es válida')
  }

  return { name, discipline: input.discipline, subDiscipline: input.subDiscipline }
}

/** Finds a category of the organization, or throws a 404. */
async function findCategory(organizationId: number, categoryId: number): Promise<Category> {
  const category = await Category.where('organizationId', organizationId).where('id', categoryId).first()

  if (!category) {
    throw new ApiException('Categoría no encontrada', 404)
  }

  return category
}

/**
 * Rejects a name already taken inside the same organization + discipline +
 * sub-discipline. Comparison is case-insensitive — allowing "4ta" next to
 * "4TA" would recreate exactly the duplication this ABM exists to remove.
 */
async function assertNameIsAvailable(
  organizationId: number,
  { name, discipline, subDiscipline }: { name: string; discipline: Discipline; subDiscipline: SubDiscipline | null },
  excludedId?: number
): Promise<void> {
  const siblings = await Category.where('organizationId', organizationId).where('discipline', discipline).get()
  const taken = siblings.some(
    (category) =>
      category.id !== excludedId &&
      (category.subDiscipline ?? null) === subDiscipline &&
      category.name.toLowerCase() === name.toLowerCase()
  )

  if (taken) {
    throw new ApiException('Ya existe una categoría con ese nombre para esa disciplina')
  }
}

/** Paginated listing of the categories of an organization, searchable by name. */
export async function getManagedCategories(
  organizationId: number,
  { query, discipline = null, page = 1, pageSize = 10 }: CategoryFilters = {}
): Promise<PaginatedResponse<Category[]>> {
  const categoriesQuery = Category.where('organizationId', organizationId)
  const normalized = (query ?? '').trim()

  if (discipline != null) {
    categoriesQuery.where('discipline', discipline)
  }

  if (normalized.length > 0) {
    // Explicit ILIKE: neorm's whereLike defaults to a case-sensitive LIKE on
    // PostgreSQL (same caveat as services/users.ts).
    categoriesQuery.where('name', 'ILIKE', `%${normalized}%`)
  }

  return categoriesQuery.orderBy('discipline').orderBy('name').paginate(pageSize, page)
}

/** Creates a category of the organization. */
export async function createCategory(organizationId: number, input: CategoryInput): Promise<Category> {
  const normalized = normalizeInput(input)

  await assertNameIsAvailable(organizationId, normalized)

  const category = new Category()

  category.organizationId = organizationId
  category.name = normalized.name
  category.discipline = normalized.discipline
  category.subDiscipline = normalized.subDiscipline
  await category.save()

  return category
}

/**
 * Updates a category of the organization.
 *
 * The discipline / sub-discipline of a category already used by a tournament or
 * holding ranking points cannot change: doing so would move historical results
 * to a discipline they were never played in. Renaming stays allowed — it is the
 * same category under a better name.
 */
export async function updateCategory(
  organizationId: number,
  categoryId: number,
  input: CategoryInput
): Promise<Category> {
  const category = await findCategory(organizationId, categoryId)
  const normalized = normalizeInput(input)
  const disciplineChanged =
    normalized.discipline !== category.discipline || normalized.subDiscipline !== (category.subDiscipline ?? null)

  if (disciplineChanged && (await countCategoryReferences(category.id)) > 0) {
    throw new ApiException(
      'La categoría ya se usa en torneos o rankings: podés renombrarla, pero no cambiar su disciplina o modalidad.'
    )
  }

  await assertNameIsAvailable(organizationId, normalized, category.id)

  category.name = normalized.name
  category.discipline = normalized.discipline
  category.subDiscipline = normalized.subDiscipline
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
export async function deleteCategory(organizationId: number, categoryId: number): Promise<void> {
  const category = await findCategory(organizationId, categoryId)
  const references = await countCategoryReferences(category.id)

  if (references > 0) {
    throw new ApiException(
      'La categoría se usa en torneos o rankings y no puede eliminarse. Podés renombrarla si el nombre ya no aplica.'
    )
  }

  await category.delete()
}
