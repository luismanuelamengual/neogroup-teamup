'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { notifyPathnameChange, setRouter } from '@/app/utils/router'

/**
 * Forwards the App Router instance and pathname changes into the non-React
 * bridge in `app/lib/router.ts`. Mounted once at the root layout level.
 */
export default function RouterBridge() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    setRouter(router)
  }, [router])

  useEffect(() => {
    notifyPathnameChange(pathname)
  }, [pathname])

  return null
}
