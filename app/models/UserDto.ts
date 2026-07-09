import { Role } from '@/app/models/Role'

/** Serializable representation of a User — safe to pass server→client. */
export interface UserDto {
  id: number
  email: string
  firstName: string | null
  lastName: string | null
  nickname: string | null
  phoneNumber: string | null
  roleId: Role | null
  createdAt: string
  displayName: string
  shortName: string
  avatarUrl: string
  active: boolean
}
