import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

export const SUPPORTED_LOCALES = ['es', 'en'] as const
export const DEFAULT_LOCALE = 'es'
export const LOCALE_COOKIE = 'locale'

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value
  const locale = SUPPORTED_LOCALES.includes(cookieLocale as SupportedLocale)
    ? (cookieLocale as SupportedLocale)
    : DEFAULT_LOCALE

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default
  }
})
