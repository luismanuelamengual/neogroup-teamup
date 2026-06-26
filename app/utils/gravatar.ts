import { createHash } from 'crypto'

/** Builds the Gravatar URL for an email address. */
export function getGravatarUrl(email: string | null | undefined, size = 200): string {
  const raw = (email ?? '').trim().toLowerCase()
  const atIndex = raw.lastIndexOf('@')
  const normalized = atIndex !== -1 ? raw.slice(0, atIndex).replace(/\+.*$/, '') + raw.slice(atIndex) : raw
  const hash = createHash('md5').update(normalized).digest('hex')

  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`
}
