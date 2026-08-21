/**
 * Everything about a venue that is a setting rather than an identity — stored
 * as a single JSON document on `sites.data` instead of one column each.
 *
 * It exists because a venue's layout has to be readable by everyone, not only
 * by the organizer who typed it in. The courts setup used to live in the
 * organizer's own browser (localStorage), which was enough while the planner
 * was the only thing that drew a court column; the moment a player can open the
 * published schedule, "Cancha 3" has to mean the same thing on both screens, so
 * it belongs to the site.
 *
 * Every field is optional: a site created by the administrator carries no
 * settings at all until an organizer plans a tournament there, and each reader
 * falls back to its own default (see `resolveCourtLabels`).
 */
export interface SiteData {
  /** How many courts the venue is planned with. */
  courts?: number
  /**
   * Custom court names, keyed by 1-based court number. A court missing here is
   * simply called "Cancha N". Note the keys are strings once the document has
   * gone through JSON, so it is read through `courtLabelOf` rather than indexed
   * directly.
   */
  courtNames?: Record<number, string>
  /**
   * Minutes every match was planned to occupy a court for, as of the last time
   * this venue was planned.
   *
   * It is a mirror, not the source of truth: the planner keeps choosing the
   * duration from its own (organizer-wide) preference and only writes the value
   * here. The published schedule needs it to tell a promised start time from an
   * "a partir de" one — a court that is still in use cannot promise an hour —
   * and a player has no other way of knowing how long a match runs.
   */
  matchDuration?: number
}

/** Default number of courts a venue is planned with. */
export const DEFAULT_SITE_COURTS = 2
/** Upper bound accepted for the courts setup of a venue. */
export const MAX_SITE_COURTS = 12

/** Display name of a court: the custom one when the venue named it, "Cancha N" otherwise. */
export function courtLabelOf(data: SiteData | null | undefined, court: number): string {
  const names = data?.courtNames as Record<string, string> | undefined

  return names?.[String(court)]?.trim() || `Cancha ${court}`
}
