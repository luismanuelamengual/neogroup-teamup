/** Tournament input normalization/validation helpers shared by API routes. */

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp);base64,/i
// ~1.1MB decoded — generous for a client-compressed poster picture while
// keeping tournament rows (and the listing payload, which embeds every
// tournament's image) reasonably sized.
const MAX_IMAGE_DATA_URL_LENGTH = 1_500_000

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
 * Validates the optional tournament poster picture, sent by the client as a
 * base64 data URL (already compressed/resized in the browser). Returns the
 * normalized value (or null when absent/cleared), or `false` when invalid.
 */
export function normalizeImage(value: unknown): string | null | false {
  if (value === undefined || value === null || value === '') {
    return null
  }

  if (typeof value !== 'string' || !IMAGE_DATA_URL_PATTERN.test(value)) {
    return false
  }

  return value.length <= MAX_IMAGE_DATA_URL_LENGTH ? value : false
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
