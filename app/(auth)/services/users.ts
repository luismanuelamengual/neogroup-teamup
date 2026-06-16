import { UserDto } from '@/app/(auth)/models/UserDto'
import { executeRequest } from '@/app/actions/api'

/** Searches platform users by name, nickname or email (for partner selection). */
export async function searchUsers(query: string): Promise<UserDto[]> {
  const normalized = query.trim()

  if (normalized.length < 2) {
    return []
  }

  return executeRequest<UserDto[]>('/getUsers', { query: normalized })
}
