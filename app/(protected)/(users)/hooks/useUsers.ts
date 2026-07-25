'use client'

import { useCallback } from 'react'
import { UserFilters } from '@/app/(protected)/(users)/models/UserFilters'
import { CreateUserInput, UpdateUserInput } from '@/app/(protected)/(users)/models/UserInput'
import { useRequests } from '@/app/hooks/useRequests'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'
import { UserDto } from '@/app/models/UserDto'

/** Client access to the administrator's user management endpoints. */
export function useUsers() {
  const executeRequest = useRequests()
  const getUsers = useCallback(
    ({ query = '', roleId = null, page = 1, pageSize = 10 }: UserFilters = {}): Promise<PaginatedResponse<UserDto[]>> =>
      executeRequest<PaginatedResponse<UserDto[]>>('/getUsers', { query, roleId, page, pageSize }),
    [executeRequest]
  )
  const createUser = useCallback(
    (input: CreateUserInput): Promise<{ id: number }> => executeRequest<{ id: number }>('/createUser', input),
    [executeRequest]
  )
  const updateUser = useCallback(
    (id: number, input: UpdateUserInput): Promise<void> => executeRequest('/updateUser', { id, ...input }),
    [executeRequest]
  )
  const deleteUser = useCallback((id: number): Promise<void> => executeRequest('/deleteUser', { id }), [executeRequest])
  const resetUserPassword = useCallback(
    (id: number): Promise<void> => executeRequest('/resetUserPassword', { id }),
    [executeRequest]
  )

  return { getUsers, createUser, updateUser, deleteUser, resetUserPassword }
}
