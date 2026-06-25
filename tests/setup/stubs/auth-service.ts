/* eslint-disable */
/**
 * Test stub for app/(auth)/services/auth.ts.
 *
 * The real module calls NextAuth({...}) and imports next/headers + server-only
 * at load time, which only works inside a Next.js runtime. The tournament engine
 * only ever touches `getSession` (through OrganizationScope, which treats a
 * thrown/empty session as "no organization filter"), so a no-session stub is all
 * the tests need. Both the sandbox loader and vitest.config.ts alias the auth
 * service to this file.
 */
export const getSession = async () => null
export const auth = async () => null
export const signIn = async () => undefined
export const signOut = async () => undefined
export const unstable_update = async () => undefined
export const handlers = {}
export default { getSession, auth, signIn, signOut, unstable_update, handlers }
