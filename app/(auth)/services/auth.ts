import bcrypt from 'bcryptjs'
import { headers as nextHeaders } from 'next/headers'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { cache } from 'react'
import { authConfig } from '@/app/(auth)/services/auth.config'
import { Role } from '@/app/models/Role'
import { User } from '@/app/models/User'
import { getOrganization } from '@/app/services/organizations'
import { getGravatarUrl } from '@/app/utils/gravatar'
import { getUserDisplayName } from '@/app/utils/users'

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Google({}),
    Credentials({
      credentials: {
        email: {},
        password: {}
      },
      async authorize(credentials, request) {
        const email = String(credentials?.email ?? '')
          .trim()
          .toLowerCase()
        const password = String(credentials?.password ?? '')

        if (!email || !password) {
          return null
        }

        const organization = await getOrganization({ host: (request as Request).headers.get('host') ?? '' })

        if (!organization) {
          return null
        }

        const user = await User.withoutGlobalScopes()
          .where('organizationId', organization.id)
          .where('email', email)
          .first()

        if (!user?.passwordHash) {
          return null
        }

        const passwordMatches = await bcrypt.compare(password, user.passwordHash)

        if (!passwordMatches) {
          return null
        }

        if (!user.emailVerified) {
          return null
        }

        return { id: String(user.id), email: user.email }
      }
    })
  ],
  callbacks: {
    ...authConfig.callbacks,

    async jwt({ token, user, account, profile, trigger }) {
      if (account?.provider === 'google' && token.email) {
        const headersList = await nextHeaders()
        const organization = await getOrganization({ host: headersList.get('host') ?? '' })

        if (organization) {
          const email = token.email.toLowerCase()
          let dbUser = await User.withoutGlobalScopes()
            .where('organizationId', organization.id)
            .where('email', email)
            .first()

          if (!dbUser) {
            const allowedRoles = organization.allowedRegistrationRoles ?? []

            // No self-registration allowed for this org — block the login.
            if (allowedRoles.length === 0) {
              return null
            }

            dbUser = new User()
            dbUser.organizationId = organization.id
            dbUser.email = email
            dbUser.passwordHash = null
            dbUser.firstName = (profile?.given_name as string | undefined) ?? null
            dbUser.lastName = (profile?.family_name as string | undefined) ?? null
            dbUser.nickname = null
            // Assign the role directly when only one is allowed; otherwise leave null for select-role.
            dbUser.roleId = allowedRoles.length === 1 ? allowedRoles[0] : null
            dbUser.emailVerified = true
            await dbUser.save()
          }

          token.userId = Number(dbUser.id)
          token.organizationId = dbUser.organizationId
          token.roleId = dbUser.roleId
          token.firstName = dbUser.firstName
          token.lastName = dbUser.lastName
          token.nickname = dbUser.nickname
          token.phoneNumber = dbUser.phoneNumber
        }
      }

      if (account?.provider === 'credentials' && user?.id) {
        const dbUser = await User.withoutGlobalScopes().find(Number(user.id))

        if (dbUser) {
          token.userId = Number(dbUser.id)
          token.organizationId = dbUser.organizationId
          token.roleId = dbUser.roleId
          token.firstName = dbUser.firstName
          token.lastName = dbUser.lastName
          token.nickname = dbUser.nickname
          token.phoneNumber = dbUser.phoneNumber
        }
      }

      if (trigger === 'update' && token.userId) {
        const dbUser = await User.find(token.userId)

        if (dbUser) {
          token.organizationId = dbUser.organizationId
          token.roleId = dbUser.roleId
          token.firstName = dbUser.firstName
          token.lastName = dbUser.lastName
          token.nickname = dbUser.nickname
          token.phoneNumber = dbUser.phoneNumber
        }
      }

      return token
    },

    async session({ session, token }) {
      if (token.userId) {
        session.user.id = String(token.userId)
        session.user.organizationId = (token.organizationId as number | undefined) ?? 0
        session.user.roleId = (token.roleId as Role | undefined) ?? null
        session.user.firstName = (token.firstName as string | undefined) ?? null
        session.user.lastName = (token.lastName as string | undefined) ?? null
        session.user.nickname = (token.nickname as string | undefined) ?? null
        session.user.phoneNumber = (token.phoneNumber as string | undefined) ?? null
        session.user.name = getUserDisplayName({
          firstName: session.user.firstName,
          lastName: session.user.lastName,
          nickname: session.user.nickname,
          email: session.user.email ?? ''
        })
        session.user.image = getGravatarUrl(session.user.email)
      }

      return session
    }
  }
})

export const getSession = cache(async () => {
  return await auth()
})
