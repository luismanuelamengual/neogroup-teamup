import { addPathnameChangeListener, getRouter, removePathnameChangeListener } from '@/app/utils/router'

export type RouteParams = Record<string, string>

interface RouteOptions {
  target?: string
}

export function goTo(url: string, params: RouteParams = {}, options?: RouteOptions): Promise<boolean> {
  if (params) {
    const queryParams = Object.entries(params)
      .filter(([key]) => !url.includes(`{${key}}`))
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&')

    Object.entries(params).forEach(([key, value]) => {
      url = url.replace(`{${key}}`, encodeURIComponent(value))
    })

    if (queryParams) {
      url += `?${queryParams}`
    }
  }

  const fullUrlTester = new RegExp('^(?:[a-z+]+:)?//', 'i')

  if (fullUrlTester.test(url)) {
    const target = options?.target ?? '_self'

    window.open(url, target)

    return Promise.resolve(true)
  }

  const router = getRouter()

  if (router) {
    return new Promise<boolean>((resolve) => {
      const listener = () => {
        removePathnameChangeListener(listener)
        resolve(true)
      }

      addPathnameChangeListener(listener)
      router.push(url)
    })
  }

  window.location.href = url

  return Promise.resolve(true)
}
