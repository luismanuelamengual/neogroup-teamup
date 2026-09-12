import { BaseEntity, EntityQuery, Scope } from '@neogroup/neorm'
import { getCurrentOrganizationId } from '@/app/services/organization-context'

/**
 * Restricts every query of an entity to the organization the current operation
 * belongs to — see `services/organization-context.ts` for where that comes from
 * (an explicit `withOrganization` context, otherwise the session).
 *
 * Resolving throws when neither is there, so a scoped model can never quietly
 * answer about every organization at once. A query that really is meant to span
 * the whole database opts out with `Entity.withoutGlobalScopes()`, which the
 * processTournaments cron, the auth flow and migration 021 all do on purpose.
 */
export class OrganizationScope implements Scope<BaseEntity> {
  async apply(query: EntityQuery<BaseEntity>): Promise<void> {
    query.where('organizationId', await getCurrentOrganizationId())
  }
}
