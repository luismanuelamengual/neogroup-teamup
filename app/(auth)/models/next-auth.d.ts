import { DefaultSession } from 'next-auth'
import { Role } from '@/app/(auth)/models/Role'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      organizationId: number
      roleId: Role | null
      firstName: string | null
      lastName: string | null
      nickname: string | null
      phoneNumber: string | null
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: number
    organizationId?: number
    roleId?: Role | null
    firstName?: string | null
    lastName?: string | null
    nickname?: string | null
    phoneNumber?: string | null
    userLoaded?: boolean
  }
}
