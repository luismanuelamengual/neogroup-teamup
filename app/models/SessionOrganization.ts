import { Organization } from '@/app/models/Organization'

/**
 * Serializable subset of Organization — safe to pass server→client and store
 * in the organization store. Deliberately excludes fields that are either
 * server-only concerns (`allowedRegistrationRoles`, `timezone`) or sensitive
 * business terms (`serviceFeePercentage`, TeamUp's cut) that the client bundle
 * has no reason to receive.
 */
export type SessionOrganization = Pick<Organization, 'id' | 'name' | 'domainName' | 'enabledDisciplines'>
