import { Role } from '@/app/(auth)/models/Role'

/** Serializable representation of a User — safe to pass server→client. */
export interface UserDto {
  id: number
  email: string
  firstName: string | null
  lastName: string | null
  nickname: string | null
  roleId: Role | null
  createdAt: string
  displayName: string
  avatarUrl: string
}
