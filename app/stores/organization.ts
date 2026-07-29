import { create } from 'zustand'
import { SessionOrganization } from '@/app/models/SessionOrganization'

/**
 * Store with the current organization. Hydrated from the session by
 * OrganizationStoreHydrator (rendered by the protected layout), so any client
 * component can read organization data without prop drilling. Mirrors
 * useUserStore.
 */
interface OrganizationState {
  organization: SessionOrganization | null
  setOrganization: (organization: SessionOrganization | null) => void
}

export const useOrganizationStore = create<OrganizationState>()((set) => ({
  organization: null,
  setOrganization: (organization) => set({ organization })
}))
