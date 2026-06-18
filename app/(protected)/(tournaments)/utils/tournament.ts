/** Tournament input normalization/validation helpers shared by API routes. */

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Validates an optional "HH:mm" start time.
 * Returns the normalized value (or null when empty), or `false` when invalid.
 */
export function normalizeStartTime(value: unknown): string | null | false {
  if (value === undefined || value === null || value === '') {
    return null
  }

  if (typeof value !== 'string') {
    return false
  }

  const trimmed = value.trim()

  if (trimmed === '') {
    return null
  }

  return TIME_PATTERN.test(trimmed) ? trimmed : false
}

/**
 * Normalizes the organizer-provided category names: trims, drops blanks and
 * removes duplicates (case-insensitive). Returns null when there are none.
 */
export function normalizeCategories(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const seen = new Set<string>()
  const categories: string[] = []

  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue
    }

    const trimmed = entry.trim()
    const key = trimmed.toLowerCase()

    if (trimmed === '' || seen.has(key)) {
      continue
    }

    seen.add(key)
    categories.push(trimmed)
  }

  return categories.length > 0 ? categories : null
}
