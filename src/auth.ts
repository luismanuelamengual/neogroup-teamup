import { Entities } from '@neogroup/neorm'
import bcrypt from 'bcryptjs'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { getUserDisplayName } from '@/app/_models/dtos'
import { User, UserModel } from '@/app/_models/user.entity'
import { getGravatarUrl } from '@/app/_utils/gravatar'
import { authConfig } from '@/auth.config'

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

        const user = await UserModel.where('email', email).first()

        if (!user?.password_hash) {
          return null
        }

        const passwordMatches = await bcrypt.compare(password, user.password_hash)

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
        let dbUser = await UserModel.where('email', email).first()

        if (!dbUser) {
          dbUser = new User()
          dbUser.email = email
          dbUser.password_hash = null
          dbUser.first_name = (profile?.given_name as string | undefined) ?? null
          dbUser.last_name = (profile?.family_name as string | undefined) ?? null
          dbUser.nickname = null
          dbUser.profile = null
          await Entities.save(dbUser)
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
        const dbUser = await UserModel.find(token.userId)

        if (dbUser) {
          token.profile = dbUser.profile
          token.firstName = dbUser.first_name
          token.lastName = dbUser.last_name
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
          first_name: token.firstName ?? null,
          last_name: token.lastName ?? null,
          nickname: token.nickname ?? null,
          email: session.user.email ?? ''
        })
        session.user.image = getGravatarUrl(session.user.email)
      }

      return session
    }
  }
})
