'use client'

import { useEffect } from 'react'
import { SessionUser } from '@/app/(auth)/models/SessionUser'
import { useUserStore } from '@/app/(auth)/stores/users'

/**
 * Hydrates the user store with the session user resolved on the server.
 * The store is filled synchronously only on the very first render (before any
 * subscriber has mounted, so role-dependent components do not flicker).
 * Afterwards updates always go through the effect: calling setState during
 * render while other components are already subscribed makes React throw
 * "Cannot update a component while rendering a different component".
 */
export default function UserStoreHydrator({ user }: { user: SessionUser | null }) {
  if (user && !useUserStore.getState().user) {
    useUserStore.setState({ user })
  }

  useEffect(() => {
    useUserStore.setState({ user })
  }, [user])

  return null
}
