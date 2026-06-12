'use client'

import { useEffect, useRef } from 'react'
import { SessionUser } from '@/app/(auth)/models/user'
import { useUserStore } from '@/app/(auth)/stores/user.store'

/**
 * Hydrates the user store with the session user resolved on the server.
 * The store is filled synchronously on the first render (so client components
 * depending on the role do not flicker) and kept in sync afterwards.
 */
export default function UserStoreHydrator({ user }: { user: SessionUser | null }) {
  const initialized = useRef(false)

  if (!initialized.current) {
    useUserStore.setState({ user })
    initialized.current = true
  }

  useEffect(() => {
    useUserStore.setState({ user })
  }, [user])

  return null
}
