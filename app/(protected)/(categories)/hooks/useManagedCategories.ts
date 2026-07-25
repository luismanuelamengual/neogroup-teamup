'use client'

import { useCallback } from 'react'
import { CategoryFilters } from '@/app/(protected)/(categories)/models/CategoryFilters'
import { CategoryInput } from '@/app/(protected)/(categories)/models/CategoryInput'
import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'
import { useRequests } from '@/app/hooks/useRequests'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'

/**
 * Client access to the administrator's category management endpoints.
 * Reading the catalogue for a selector goes through `useCategories` instead.
 */
export function useManagedCategories() {
  const executeRequest = useRequests()
  const getManagedCategories = useCallback(
    ({ query = '', discipline = null, page = 1, pageSize = 10 }: CategoryFilters = {}): Promise<
      PaginatedResponse<CategoryDto[]>
    > =>
      executeRequest<PaginatedResponse<CategoryDto[]>>('/getManagedCategories', {
        query,
        discipline,
        page,
        pageSize
      }),
    [executeRequest]
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

  return { getManagedCategories, createCategory, updateCategory, deleteCategory }
}
