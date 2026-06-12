import bcrypt from 'bcryptjs'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { User } from '@/app/(auth)/entities/User'
import { getUserDisplayName } from '@/app/(auth)/models/user'
import { authConfig } from '@/app/(auth)/services/auth.config'
import { getGravatarUrl } from '@/app/utils/gravatar'

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      allowDangerousEmailAccountLinking: true
    }),
    Credentials({
      credentials: {
        email: {},
        password: {}
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '')
          .trim()
          .toLowerCase()
        const password = String(credentials?.password ?? '')

        if (!email || !password) {
          return null
        }

        const user = await User.where('email', email).first()

        if (!user?.passwordHash) {
          return null
        }

        const passwordMatches = await bcrypt.compare(password, user.passwordHash)

        if (!passwordMatches) {
          return null
        }

        return { id: String(user.id), email: user.email }
      }
    })
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account, profile, trigger }) {
      // First sign-in with Google: find or create the application user.
      if (account?.provider === 'google' && token.email) {
        const email = token.email.toLowerCase()
        let dbUser = await User.where('email', email).first()

        if (!dbUser) {
          dbUser = new User()
          dbUser.email = email
          dbUser.passwordHash = null
          dbUser.firstName = (profile?.given_name as string | undefined) ?? null
          dbUser.lastName = (profile?.family_name as string | undefined) ?? null
          dbUser.nickname = null
          dbUser.profile = null
          await dbUser.save()
        }

        token.userId = Number(dbUser.id)
        token.profileLoaded = false
      }

      // First sign-in with credentials.
      if (account?.provider === 'credentials' && user?.id) {
        token.userId = Number(user.id)
        token.profileLoaded = false
      }

      // Load (or reload after an update) the user attributes into the token.
      if (token.userId && (!token.profileLoaded || trigger === 'update')) {
        const dbUser = await User.find(token.userId)

        if (dbUser) {
          token.profile = dbUser.profile
          token.firstName = dbUser.firstName
          token.lastName = dbUser.lastName
          token.nickname = dbUser.nickname
          token.profileLoaded = true
        }
      }

      return token
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = String(token.userId)
        session.user.profile = token.profile ?? null
        session.user.firstName = token.firstName ?? null
        session.user.lastName = token.lastName ?? null
        session.user.nickname = token.nickname ?? null
        session.user.name = getUserDisplayName({
          firstName: token.firstName ?? null,
          lastName: token.lastName ?? null,
          nickname: token.nickname ?? null,
          email: session.user.email ?? ''
        })
        session.user.image = getGravatarUrl(session.user.email)
      }

      return session
    }
  }
})
