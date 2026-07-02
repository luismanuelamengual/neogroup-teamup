import { existsSync } from 'fs'
import { unstable_cache } from 'next/cache'
import { join } from 'path'
import { Organization } from '@/app/models/Organization'

type GetOrganizationOptions =
  | { id: number; domainName?: never; host?: never }
  | { domainName: string; id?: never; host?: never }
  | { host: string; id?: never; domainName?: never }

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
export async function getOrganization({ id, domainName, host }: GetOrganizationOptions): Promise<Organization | null> {
  if (id !== undefined) {
    return getOrganizationById(id)
  }

  if (domainName !== undefined) {
    return getOrganizationByDomain(domainName)
  }

  if (host !== undefined) {
    let domainFromHost: string | undefined = process.env.DEV_ORGANIZATION_DOMAIN

    if (host) {
      const parts = host.split('.')

      if (parts.length === 3) {
        domainFromHost = parts[0]
      }
    }

    if (domainFromHost) {
      return getOrganizationByDomain(domainFromHost)
    }
  }

  return null
}

/**
 * Resolves the logo path for an organization, checking on the server whether a
 * custom `public/{organizationDomain}/{fileName}` file exists.
 * Falls back to `/{fileName}` (the default logo) otherwise.
 *
 * Doing this check server-side avoids the client requesting a missing image
 * and briefly rendering a broken-image icon before falling back.
 */
export function resolveOrganizationImage(organizationDomain: string | null | undefined, fileName: string): string {
  if (organizationDomain && existsSync(join(process.cwd(), 'public', organizationDomain, fileName))) {
    return `/${organizationDomain}/${fileName}`
  }

  return `/${fileName}`
}
