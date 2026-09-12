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
/**
 * The session the stub hands out. Null by default, which is what every test
 * that does not care about the organization relies on: OrganizationScope (and
 * any service resolving the organization by hand) then applies no filter at
 * all, the same way it behaves in scripts and seeds.
 *
 * A test that DOES exercise organization scoping signs in with
 * `setTestSession` and MUST clear it again in an afterEach — test files share
 * one process (fileParallelism is off), so a session left behind would start
 * filtering everybody else's queries.
 */
let testSession: { user: { id: number; organizationId: number } } | null = null

export const setTestSession = (session: typeof testSession) => {
  testSession = session
}

export const getSession = async () => testSession
export const auth = async () => testSession
export const signIn = async () => undefined
export const signOut = async () => undefined
export const unstable_update = async () => undefined
export const handlers = {}
export default { getSession, auth, signIn, signOut, unstable_update, handlers }
