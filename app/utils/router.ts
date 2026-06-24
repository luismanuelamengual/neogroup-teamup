import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

/**
 * Bridge between non-React code (e.g. action helpers in `app/actions/routings.ts`)
 * and the App Router's `useRouter()` hook.
 *
 * The RouterBridge component mounted at the root captures the router instance
 * with `setRouter()` so that `goTo()` can do client-side navigation without a
 * full page reload.
 */
type PathnameChangeListener = (pathname: string) => void

let routerInstance: AppRouterInstance | null = null
const pathnameChangeListeners = new Set<PathnameChangeListener>()

export function setRouter(router: AppRouterInstance): void {
  routerInstance = router
}

export function getRouter(): AppRouterInstance | null {
  return routerInstance
}

export function addPathnameChangeListener(listener: PathnameChangeListener): void {
  pathnameChangeListeners.add(listener)
}

export function removePathnameChangeListener(listener: PathnameChangeListener): void {
  pathnameChangeListeners.delete(listener)
}

export function notifyPathnameChange(pathname: string): void {
  pathnameChangeListeners.forEach((listener) => listener(pathname))
}
