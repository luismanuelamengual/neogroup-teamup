import { describe, expect, it } from 'vitest'
import { getUserDisplayName, getUserShortName, normalizeName } from '@/app/utils/users'

describe('normalizeName', () => {
  it('title-cases a fully lower-case name with a stray capital', () => {
    expect(normalizeName('yamila pErez')).toBe('Yamila Perez')
  })

  it('title-cases a fully upper-case name', () => {
    expect(normalizeName('RICARDO MOYA')).toBe('Ricardo Moya')
  })

  it('trims leading/trailing whitespace and collapses internal spaces', () => {
    expect(normalizeName('  maria   jose  ')).toBe('Maria Jose')
  })

  it('capitalizes after hyphens and apostrophes', () => {
    expect(normalizeName('jean-paul')).toBe('Jean-Paul')
    expect(normalizeName("o'brien")).toBe("O'Brien")
  })

  it('normalizes accented letters correctly', () => {
    expect(normalizeName('ñañez')).toBe('Ñañez')
    expect(normalizeName('ÁLVAREZ')).toBe('Álvarez')
  })

  it('is idempotent', () => {
    const once = normalizeName('yamila pErez')

    expect(normalizeName(once)).toBe(once)
  })

  it('returns an empty string unchanged', () => {
    expect(normalizeName('')).toBe('')
    expect(normalizeName('   ')).toBe('')
  })
})

describe('getUserDisplayName / getUserShortName', () => {
  it('build the display name from firstName + lastName as stored', () => {
    const user = { firstName: 'Yamila', lastName: 'Perez', email: 'yamila@example.com' }

    expect(getUserDisplayName(user)).toBe('Yamila Perez')
    expect(getUserShortName(user)).toBe('Y. Perez')
  })

  it('normalize casing on display without touching the stored value', () => {
    const user = { firstName: 'yamila pErez', lastName: 'moya', email: 'yamila@example.com' }

    expect(getUserDisplayName(user)).toBe('Yamila Perez Moya')
    expect(getUserShortName(user)).toBe('Y. Moya')
    // The input object itself is untouched — normalization is display-only.
    expect(user.firstName).toBe('yamila pErez')

    const allCaps = { firstName: 'RICARDO', lastName: 'MOYA', email: 'ricardo@example.com' }

    expect(getUserDisplayName(allCaps)).toBe('Ricardo Moya')
    expect(getUserShortName(allCaps)).toBe('R. Moya')
  })

  it('fall back to email when no name is set', () => {
    const user = { firstName: null, lastName: null, email: 'yamila@example.com' }

    expect(getUserDisplayName(user)).toBe('yamila@example.com')
    expect(getUserShortName(user)).toBe('yamila@example.com')
  })
})
