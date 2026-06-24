import toast from 'react-hot-toast'

export function showSuccessMessage(message: string, duration = 5000) {
  toast.success(message, { duration })
}

export function showWarningMessage(message: string, duration = 5000) {
  toast(message, { duration, icon: '⚠️' })
}

export function showErrorMessage(message: string, duration = 5000) {
  toast.error(message, { duration })
}
