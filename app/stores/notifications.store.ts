import { create } from 'zustand'

export type NotificationSeverity = 'success' | 'error' | 'info'

interface NotificationsState {
  message: string | null
  severity: NotificationSeverity
  notify: (message: string, severity?: NotificationSeverity) => void
  clear: () => void
}

/** Global snackbar notifications. */
export const useNotificationsStore = create<NotificationsState>((set) => ({
  message: null,
  severity: 'info',
  notify: (message, severity = 'error') => set({ message, severity }),
  clear: () => set({ message: null })
}))
