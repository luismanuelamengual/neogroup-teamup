import { Organization } from '@/app/models/Organization'

/**
 * Serializable subset of Organization — safe to pass server→client and store
 * in the organization store. Deliberately excludes the fields that are purely
 * server-side concerns (`allowedRegistrationRoles`, `timezone`).
 *
 * `serviceFeePercentage` is included: TeamUp's cut is stated to the organizer
 * in the tournament form and in the Pagos page, and hydrating it with the rest
 * of the organization keeps those screens from each resolving it their own way.
 * It is the organization's own commercial term, not a secret — the checkout it
 * produces is shown to the same people.
 */
export type SessionOrganization = Pick<
  Organization,
  'id' | 'name' | 'domainName' | 'enabledDisciplines' | 'serviceFeePercentage'
>
