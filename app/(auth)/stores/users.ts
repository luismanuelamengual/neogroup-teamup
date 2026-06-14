import { create } from 'zustand'
import { Role } from '@/app/(auth)/models/Role'
import { SessionUser } from '@/app/(auth)/models/SessionUser'

/**
 * Store with the signed-in user. It is hydrated from the session by
 * UserStoreHydrator (rendered by AppLayout), so any client component can
 * take decisions based on the user role without prop drilling.
 */
interface UserState {
  user: SessionUser | null
  setUser: (user: SessionUser | null) => void
}

export const useUserStore = create<UserState>()((set) => ({
  user: null,
  setUser: (user) => set({ user })
}))

/** Role of the signed-in user (null while the store is not hydrated). */
export function useUserRole(): Role | null {
  return useUserStore((state) => state.user?.roleId ?? null)
}

/** True when the signed-in user is an organizer. */
export function useIsOrganizer(): boolean {
  return useUserStore((state) => state.user?.roleId === Role.ORGANIZER)
}
