'use client'

import { useCallback } from 'react'
import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { useRequests } from '@/app/hooks/useRequests'

export function useCategories() {
  const executeRequest = useRequests()
  const getCategories = useCallback(
    (discipline: Discipline, subDiscipline: SubDiscipline | null): Promise<CategoryDto[]> =>
      executeRequest<CategoryDto[]>('/getCategories', { discipline, subDiscipline }),
    [executeRequest]
  )

  return { getCategories }
}
