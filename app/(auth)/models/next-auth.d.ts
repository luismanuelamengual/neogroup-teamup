import { DefaultSession } from 'next-auth'
import { Role } from '@/app/models/Role'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      organizationId: number
      roleId: Role | null
      firstName: string | null
      lastName: string | null
      phoneNumber: string | null
      siteId: number | null
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
    phoneNumber?: string | null
    siteId?: number | null
    userLoaded?: boolean
  }
}
