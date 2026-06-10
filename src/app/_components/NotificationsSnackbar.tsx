'use client'

import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'

import { useNotificationsStore } from '@/app/_stores/notifications.store'

/** Renders the global notifications managed by the notifications store. */
export default function NotificationsSnackbar() {
  const message = useNotificationsStore((state) => state.message)
  const severity = useNotificationsStore((state) => state.severity)
  const clear = useNotificationsStore((state) => state.clear)

  return (
    <Snackbar
      open={!!message}
      autoHideDuration={5000}
      onClose={clear}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert severity={severity} onClose={clear}>
        {message}
      </Alert>
    </Snackbar>
  )
}
