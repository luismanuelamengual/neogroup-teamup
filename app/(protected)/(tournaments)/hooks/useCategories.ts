'use client'

import { useCallback } from 'react'
import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { useRequests } from '@/app/hooks/useRequests'

export function useCategories() {
  const executeRequest = useRequests()
  const getCategories = useCallback(
    (discipline: Discipline): Promise<CategoryDto[]> => executeRequest<CategoryDto[]>('/getCategories', { discipline }),
    [executeRequest]
  )

  return { getCategories }
}
