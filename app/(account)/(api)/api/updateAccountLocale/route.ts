import { cookies } from 'next/headers'
import { ApiException } from '@/app/models/ApiException'
import { withApi } from '@/app/utils/api-server'
import { LOCALE_COOKIE, SUPPORTED_LOCALES, SupportedLocale } from '@/app/utils/lang'

/** POST /api/updateAccountLocale — changes the interface language (stored in a cookie). */
export const POST = withApi(async (request) => {
  const { locale } = (await request.json()) as { locale: string }

  if (!SUPPORTED_LOCALES.includes(locale as SupportedLocale)) {
    throw new ApiException('invalidLocale')
  }

  const cookieStore = await cookies()

  cookieStore.set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, path: '/' })
})
