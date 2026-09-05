import { create } from 'zustand'

/**
 * Payments state shared across the app: currently just the organization-wide
 * overdue-payments count (tournaments started more than two months ago and still
 * unpaid). Fetched once, right after sign-in, by OverduePaymentsLoader
 * (mounted in the protected layout), so any client component can read it
 * straight from here instead of hitting the database again. Mirrors
 * useUserStore / useOrganizationStore.
 */
interface PaymentsState {
  overdueCount: number
  setOverdueCount: (overdueCount: number) => void
}

export const usePaymentsStore = create<PaymentsState>()((set) => ({
  overdueCount: 0,
  setOverdueCount: (overdueCount) => set({ overdueCount })
}))
