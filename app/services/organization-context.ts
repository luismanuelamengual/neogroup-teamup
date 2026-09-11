import { AsyncLocalStorage } from 'node:async_hooks'
import { getSession } from '@/app/(auth)/services/auth'

/**
 * The organization the current operation belongs to.
 *
 * Every organization-scoped model (`User`, `Tournament`, `Category`, `Site`,
 * `Ranking`) filters by it through `OrganizationScope`, which is the only reason
 * a service can be written as `getTournaments()` instead of
 * `getTournaments(organizationId)`: the tenant is ambient, not an argument
 * threaded through every signature.
 *
 * It is resolved from two places, in order:
 *
 *   1. An explicit context opened with `withOrganization` — how a cron, a
 *      script or a test states which organization it is acting for, since none
 *      of them has a signed-in user.
 *   2. The session, for everything served under a request. Server Components
 *      call services directly (see `tournaments/page.tsx` and friends), so this
 *      is a first-class path and not a fallback for legacy code.
 *
 * `withOrganization` takes precedence on purpose: an operation that says out
 * loud which tenant it is for should never have that overridden by whoever
 * happens to be signed in.
 *
 * When neither is there, resolving fails loudly. That is the whole point: an
 * organization-scoped query with nothing to scope by is not a query "without a
 * filter", it is a query that silently answers about every organization at
 * once — a total across tenants, or a lookup that reaches into someone else's
 * data. Code that genuinely wants to span the database says so with
 * `Entity.withoutGlobalScopes()`, and that reads as the deliberate choice it is.
 *
 * Edge runtime note: `node:async_hooks` is Node-only, and that is fine here.
 * The middleware (`proxy.ts`) runs on the Edge but imports only `auth.config`
 * and `utils/domains`, so nothing in this module's graph ever reaches it —
 * every organization-scoped query happens in a Server Component or an API
 * route, both of which run in the Node.js runtime.
 */

const organizationStorage = new AsyncLocalStorage<number>()

/**
 * Runs `callback` as if it belonged to `organizationId`, for itself and
 * everything it awaits.
 *
 *   await withOrganization(tournament.organizationId, () => finishTournament(tournament))
 *
 * This is what lets a cron reuse the very same service functions a request
 * does. Prefer it over passing an organizationId down by hand: the services
 * below it need to know nothing, and the context cannot leak past the callback.
 */
export function withOrganization<T>(organizationId: number, callback: () => Promise<T>): Promise<T> {
  return organizationStorage.run(organizationId, callback)
}

/**
 * The organization of the current operation.
 *
 * Throws when nothing said which one it is: no `withOrganization` context and
 * no session. See the note at the top of this file for why that is an error
 * rather than "no filter".
 */
export async function getCurrentOrganizationId(): Promise<number> {
  const contextOrganizationId = organizationStorage.getStore()

  if (contextOrganizationId != null) {
    return contextOrganizationId
  }

  let session = null

  try {
    session = await getSession()
  } catch {
    // Outside a request scope (scripts, seeds, the test harness) reading the
    // session throws rather than returning null. Treated the same as no
    // session: there is nothing left to fall back to.
    session = null
  }

  if (!session) {
    throw new Error(
      'No organization in context: this operation queries an organization-scoped model but nothing ' +
        'said which organization it belongs to. Wrap it in withOrganization(organizationId, ...) — ' +
        'what the processTournaments cron and the test harness do — or, if it really is meant to span ' +
        'every organization, opt out explicitly with Entity.withoutGlobalScopes().'
    )
  }

  if (!session.user.organizationId) {
    throw new Error('User not assigned to any organization')
  }

  return session.user.organizationId
}
