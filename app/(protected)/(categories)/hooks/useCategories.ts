'use client'

import { useCallback } from 'react'
import { CategoryDto } from '@/app/(protected)/(categories)/models/CategoryDto'
import { CategoryFilters } from '@/app/(protected)/(categories)/models/CategoryFilters'
import { CategoryInput } from '@/app/(protected)/(categories)/models/CategoryInput'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { useRequests } from '@/app/hooks/useRequests'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'

/**
 * Page size used by `getAllCategories`. The categories of an organization for
 * a discipline are a handful of divisions, so a single request always covers
 * the whole catalogue.
 */
const ALL_CATEGORIES_PAGE_SIZE = 500

/** Client access to the category endpoints. */
export function useCategories() {
  const executeRequest = useRequests()
  const getCategories = useCallback(
    ({ query = '', discipline = null, ids, page = 1, pageSize = 10 }: CategoryFilters = {}): Promise<
      PaginatedResponse<CategoryDto[]>
    > =>
      executeRequest<PaginatedResponse<CategoryDto[]>>('/getCategories', {
        query,
        discipline,
        ids,
        page,
        pageSize
      }),
    [executeRequest]
  )
  /** Every category of a discipline, ordered by name — what the CategorySelector needs. */
  const getAllCategories = useCallback(
    async (discipline: Discipline): Promise<CategoryDto[]> =>
      (await getCategories({ discipline, pageSize: ALL_CATEGORIES_PAGE_SIZE })).data,
    [getCategories]
  )
  const createCategory = useCallback(
    (input: CategoryInput): Promise<{ id: number }> => executeRequest<{ id: number }>('/createCategory', input),
    [executeRequest]
  )
  const updateCategory = useCallback(
    (id: number, input: CategoryInput): Promise<void> => executeRequest('/updateCategory', { id, ...input }),
    [executeRequest]
  )
  const deleteCategory = useCallback(
    (id: number): Promise<void> => executeRequest('/deleteCategory', { id }),
    [executeRequest]
  )

  return { getCategories, getAllCategories, createCategory, updateCategory, deleteCategory }
}
