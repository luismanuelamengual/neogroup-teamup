import { UserRoleId } from '@/app/(auth)/models/UserRoles'

/** The signed-in user, as stored in the user store and the session. */
export interface SessionUser {
  id: number
  email: string
  firstName: string | null
  lastName: string | null
  nickname: string | null
  displayName: string
  avatarUrl: string
  roleId: UserRoleId | null
}
