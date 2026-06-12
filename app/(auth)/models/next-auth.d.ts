import { DefaultSession } from 'next-auth'
import { UserRoleId } from '@/app/(auth)/models/UserRoles'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      roleId: UserRoleId | null
      firstName: string | null
      lastName: string | null
      nickname: string | null
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: number
    roleId?: UserRoleId | null
    firstName?: string | null
    lastName?: string | null
    nickname?: string | null
    userLoaded?: boolean
  }
}
