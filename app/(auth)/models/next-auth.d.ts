import { DefaultSession } from 'next-auth'
import { Profile } from '@/app/(auth)/models/user'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      profile: Profile | null
      firstName: string | null
      lastName: string | null
      nickname: string | null
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: number
    profile?: Profile | null
    firstName?: string | null
    lastName?: string | null
    nickname?: string | null
    profileLoaded?: boolean
  }
}
