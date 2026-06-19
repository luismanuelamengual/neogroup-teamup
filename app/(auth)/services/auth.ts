import bcrypt from 'bcryptjs'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { Organization } from '@/app/(auth)/models/Organization'
import { Role } from '@/app/(auth)/models/Role'
import { User } from '@/app/(auth)/models/User'
import { authConfig } from '@/app/(auth)/services/auth.config'
import { getUserDisplayName } from '@/app/(auth)/utils/user'
import { getGravatarUrl } from '@/app/utils/gravatar'

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

        // Resolve the organization from the subdomain so we only look up users
        // that belong to the current organization.
        const orgDomain = (request as Request).headers.get('x-org-domain') ?? process.env.DEFAULT_ORG_DOMAIN ?? 'demo'
        const organization = await Organization.where('domainName', orgDomain).first()

        if (!organization) {
          return null
        }

        const user = await User.where('organizationId', organization.id).where('email', email).first()

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
    /**
     * For Google sign-in: find or create the user scoped to the current
     * organization (resolved from the x-org-domain header set by the proxy).
     * This runs before the jwt callback and has access to the request.
     */
    async signIn({ user, account, profile, request }) {
      if (account?.provider === 'google') {
        const orgDomain = (request as Request)?.headers?.get('x-org-domain') ?? process.env.DEFAULT_ORG_DOMAIN ?? 'demo'
        const organization = await Organization.where('domainName', orgDomain).first()

        if (!organization) {
          return false
        }

        const email = (user.email ?? '').toLowerCase()

        if (!email) {
          return false
        }

        let dbUser = await User.where('organizationId', organization.id).where('email', email).first()

        if (!dbUser) {
          dbUser = new User()
          dbUser.organizationId = organization.id
          dbUser.email = email
          dbUser.passwordHash = null
          dbUser.firstName = (profile?.given_name as string | undefined) ?? null
          dbUser.lastName = (profile?.family_name as string | undefined) ?? null
          dbUser.nickname = null
          dbUser.roleId = null
          await dbUser.save()
        }

        // Overwrite user.id with our internal DB id so the jwt callback can
        // read it via the `user` parameter on first sign-in.
        user.id = String(dbUser.id)
      }

      return true
    },

    async jwt({ token, user, account, trigger }) {
      // First sign-in with Google: user.id was set in the signIn callback above.
      if (account?.provider === 'google' && user?.id) {
        token.userId = Number(user.id)
        token.userLoaded = false
      }

      // First sign-in with credentials.
      if (account?.provider === 'credentials' && user?.id) {
        token.userId = Number(user.id)
        token.userLoaded = false
      }

      // Load (or reload after an update) the user attributes into the token,
      // including the organizationId needed for org isolation checks.
      if (token.userId && (!token.userLoaded || trigger === 'update')) {
        const dbUser = await User.find(token.userId)

        if (dbUser) {
          token.organizationId = dbUser.organizationId
          token.roleId = dbUser.roleId
          token.firstName = dbUser.firstName
          token.lastName = dbUser.lastName
          token.nickname = dbUser.nickname
          token.userLoaded = true
        }
      }

      return token
    },

    async session({ session, token }) {
      if (token.userId) {
        session.user.id = String(token.userId)
        session.user.organizationId = token.organizationId ?? 0
        session.user.roleId = (token.roleId as Role | undefined) ?? null
        session.user.firstName = (token.firstName as string | undefined) ?? null
        session.user.lastName = (token.lastName as string | undefined) ?? null
        session.user.nickname = (token.nickname as string | undefined) ?? null
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
