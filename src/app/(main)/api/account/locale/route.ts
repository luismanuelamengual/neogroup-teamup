import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { LOCALE_COOKIE, SUPPORTED_LOCALES, SupportedLocale } from '@/i18n/request'

/** PUT /api/account/locale — changes the interface language (stored in a cookie). */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const { locale } = (await request.json()) as { locale: string }

  if (!SUPPORTED_LOCALES.includes(locale as SupportedLocale)) {
    return NextResponse.json({ success: false, error: 'invalidLocale' }, { status: 400 })
  }

  const cookieStore = await cookies()

  cookieStore.set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, path: '/' })

  return NextResponse.json({ success: true })
}
