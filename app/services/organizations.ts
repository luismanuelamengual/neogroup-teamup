import { unstable_cache } from 'next/cache'
import { Organization } from '@/app/models/Organization'

type GetOrganizationOptions = { domainName: string; id?: never } | { id: number; domainName?: never }

const getOrganizationByDomain = unstable_cache(
  async (domainName: string): Promise<Organization | null> => {
    return Organization.where('domainName', domainName).first()
  },
  ['organization-by-domain'],
  { revalidate: 86400, tags: ['organizations'] }
)
const getOrganizationById = unstable_cache(
  async (id: number): Promise<Organization | null> => {
    return Organization.where('id', id).first()
  },
  ['organization-by-id'],
  { revalidate: 86400, tags: ['organizations'] }
)

/**
 * Returns an organization by domainName or id.
 * Results are cached by Next.js Data Cache (1 hour, tag "organizations").
 */
export function getOrganization(options: GetOrganizationOptions): Promise<Organization | null> {
  if (options.id !== undefined) {
    return getOrganizationById(options.id)
  }

  return getOrganizationByDomain(options.domainName)
}
