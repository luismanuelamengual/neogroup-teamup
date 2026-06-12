import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import accountEn from '@/app/(account)/lang/en.json'
import accountEs from '@/app/(account)/lang/es.json'
import authEn from '@/app/(auth)/lang/en.json'
import authEs from '@/app/(auth)/lang/es.json'
import tournamentsEn from '@/app/(tournaments)/lang/en.json'
import tournamentsEs from '@/app/(tournaments)/lang/es.json'
import commonEn from '@/app/lang/en.json'
import commonEs from '@/app/lang/es.json'

export const SUPPORTED_LOCALES = ['es', 'en'] as const
export const DEFAULT_LOCALE = 'es'
export const LOCALE_COOKIE = 'locale'

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

/**
 * Internationalization is distributed: every module owns its texts inside its
 * own lang/ folder (e.g. app/(tournaments)/lang/es.json) and the files at
 * app/lang/ hold the texts shared by the whole app (common, nav).
 *
 * Each module file declares its own top-level namespaces, so merging the
 * objects is enough to build the full message catalog. When a new module
 * adds a lang/ folder, register its files here.
 */
const MESSAGES: Record<SupportedLocale, Record<string, unknown>> = {
  es: { ...commonEs, ...authEs, ...accountEs, ...tournamentsEs },
  en: { ...commonEn, ...authEn, ...accountEn, ...tournamentsEn }
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value
  const locale = SUPPORTED_LOCALES.includes(cookieLocale as SupportedLocale)
    ? (cookieLocale as SupportedLocale)
    : DEFAULT_LOCALE

  return {
    locale,
    messages: MESSAGES[locale] as never
  }
})
