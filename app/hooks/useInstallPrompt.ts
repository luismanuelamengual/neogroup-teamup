'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

/**
 * Captures the browser's `beforeinstallprompt` event so the app can trigger
 * the native "Install app" flow from its own UI (e.g. a menu item) instead of
 * relying on the browser's own install icon/menu entry.
 *
 * The event is only fired by Chromium-based browsers (Chrome, Edge) when the
 * PWA installability criteria (manifest + active service worker) are met, and
 * only once per page load — the browser withholds it if the app is already
 * installed or if it decides the user hasn't engaged with the site enough
 * yet. iOS Safari never fires it; there `canInstall` stays false and the
 * user must use the manual "Share > Add to Home Screen" flow instead.
 */
export function useInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    const matchStandalone = window.matchMedia('(display-mode: standalone)')

    setIsInstalled(matchStandalone.matches)

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setInstallEvent(null)
    }

    const handleDisplayModeChange = (event: MediaQueryListEvent) => setIsInstalled(event.matches)

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    matchStandalone.addEventListener('change', handleDisplayModeChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      matchStandalone.removeEventListener('change', handleDisplayModeChange)
    }
  }, [])

  const promptInstall = async () => {
    if (!installEvent) {
      return
    }

    await installEvent.prompt()
    await installEvent.userChoice
    // The event can only be used once; discard it either way.
    setInstallEvent(null)
  }

  return {
    // Only true while the browser has handed us a usable, not-yet-consumed
    // install prompt and the app isn't already installed.
    canInstall: !!installEvent && !isInstalled,
    isInstalled,
    promptInstall
  }
}
