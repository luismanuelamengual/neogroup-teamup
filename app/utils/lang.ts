import { promises as fs } from 'fs'
import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import path from 'path'

export const SUPPORTED_LOCALES = ['es', 'en'] as const
export const DEFAULT_LOCALE = 'es'
export const LOCALE_COOKIE = 'locale'

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

/**
 * Internationalization is distributed: every module owns its texts inside its
 * own lang/ folder (e.g. app/(tournaments)/lang/es.json) and app/lang/ holds
 * the texts shared by the whole app (common, nav).
 *
 * The catalogs are discovered dynamically: every app/<dir>/lang/<locale>.json
 * file is merged into the full message catalog, so adding a new module with a
 * lang/ folder requires no registration anywhere.
 */
const messagesCache: Partial<Record<SupportedLocale, Record<string, unknown>>> = {}

async function readLangFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>
  } catch (_error) {
    return null
  }
}

async function findLangDirs(dir: string): Promise<string[]> {
  const results: string[] = []
  let entries: import('fs').Dirent[]

  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const fullPath = path.join(dir, entry.name)

    if (entry.name === 'lang') {
      results.push(fullPath)
    } else {
      results.push(...(await findLangDirs(fullPath)))
    }
  }

  return results
}

async function loadMessages(locale: SupportedLocale): Promise<Record<string, unknown>> {
  const cached = messagesCache[locale]

  if (cached && process.env.NODE_ENV === 'production') {
    return cached
  }

  const appDir = path.join(process.cwd(), 'app')
  const langDirs = await findLangDirs(appDir)
  const messages: Record<string, unknown> = {}

  for (const langDir of langDirs) {
    const moduleMessages = await readLangFile(path.join(langDir, `${locale}.json`))

    if (moduleMessages) {
      Object.assign(messages, moduleMessages)
    }
  }

  messagesCache[locale] = messages

  return messages
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value
  const locale = SUPPORTED_LOCALES.includes(cookieLocale as SupportedLocale)
    ? (cookieLocale as SupportedLocale)
    : DEFAULT_LOCALE

  return {
    locale,
    messages: (await loadMessages(locale)) as never
  }
})
