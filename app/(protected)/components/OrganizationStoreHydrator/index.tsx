'use client'

import { useEffect } from 'react'
import { SessionOrganization } from '@/app/models/SessionOrganization'
import { useOrganizationStore } from '@/app/stores/organization'

/**
 * Hydrates the organization store with the session organization resolved on
 * the server. The store is filled synchronously only on the very first render
 * (before any subscriber has mounted, so components that depend on it — e.g.
 * discipline selectors — do not flicker). Afterwards updates always go through
 * the effect. Mirrors UserStoreHydrator.
 */
export default function OrganizationStoreHydrator({ organization }: { organization: SessionOrganization | null }) {
  if (organization && !useOrganizationStore.getState().organization) {
    useOrganizationStore.setState({ organization })
  }

  useEffect(() => {
    useOrganizationStore.setState({ organization })
  }, [organization])

  return null
}
