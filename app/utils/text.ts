/**
 * Folds a name into its comparable form: lower-cased and stripped of accents,
 * so "perez" matches "Pérez" and "munoz" matches "Muñoz". Searching by name is
 * near useless in Spanish if the accent has to be typed exactly.
 */
export function foldForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * Splits a raw search box value into the terms every match must satisfy.
 * Whitespace-separated so "agui contre" reads as "Aguilar and Contreras",
 * each term folded the same way the searchable text is.
 */
export function searchTerms(value: string): string[] {
  return foldForSearch(value).split(/\s+/).filter(Boolean)
}
