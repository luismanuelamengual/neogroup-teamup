import { useCallback } from 'react'
import toast from 'react-hot-toast'

export function useNotifications() {
  const showSuccessMessage = useCallback((message: string, duration = 5000) => {
    toast.success(message, { duration })
  }, [])
  const showWarningMessage = useCallback((message: string, duration = 5000) => {
    toast(message, { duration, icon: '⚠️' })
  }, [])
  const showErrorMessage = useCallback((message: string, duration = 5000) => {
    toast.error(message, { duration })
  }, [])

  return { showSuccessMessage, showWarningMessage, showErrorMessage }
}
