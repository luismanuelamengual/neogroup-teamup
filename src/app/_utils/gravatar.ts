import { createHash } from 'crypto'

/** Builds the Gravatar URL for an email address. */
export function getGravatarUrl(email: string | null | undefined, size = 200): string {
  const normalized = (email ?? '').trim().toLowerCase()
  const hash = createHash('md5').update(normalized).digest('hex')

  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`
}
