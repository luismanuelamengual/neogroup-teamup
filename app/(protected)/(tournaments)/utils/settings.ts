import { TournamentSettings } from '@/app/(protected)/(tournaments)/models/TournamentSettings'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'

/**
 * Readers of the `tournaments.settings` JSON payload.
 *
 * Deliberately free of entity/database imports — same shape as `utils/score`
 * for a MatchScore — so both the server engine and the client views can apply
 * the exact same interpretation of a tournament's configuration.
 */

/**
 * Whether a tournament materialises its whole round robin up front and accepts
 * results in any order, with no "active" round (see
 * `LeagueSettings.allowUnorderedResults`).
 *
 * Only the two round-robin types that expose the setting can opt in: a plain
 * league, and the group phase of a groups+playoff. Every other type keeps the
 * classic sequential behaviour unconditionally — americanos pair their later
 * rounds from the standings (so those rounds cannot exist before the previous
 * results do), interclubes derives its format from the entry count, and
 * knockouts are already materialised up front.
 *
 * This is the single gate for the whole feature: when it returns false, every
 * code path behaves exactly as it did before the setting existed.
 */
export function allowsUnorderedResults(type: TournamentType, settings: TournamentSettings | null | undefined): boolean {
  if (type !== TournamentType.LEAGUE && type !== TournamentType.GROUPS_PLAYOFF) {
    return false
  }

  return settings?.allowUnorderedResults === true
}

/**
 * How many matches each competitor is due when results are loaded unordered:
 * the `maxRounds` setting re-read as a per-competitor quota (see
 * `LeagueSettings.maxRounds`). Null means no quota, i.e. the full round robin.
 *
 * Once a competitor reaches the quota their remaining fixtures are voided, so
 * the quota also decides when the phase runs out of playable matches. Callers
 * that display it must check `allowsUnorderedResults` first: for the ordered
 * formats the same setting means a cap on ROUNDS, not on matches.
 */
export function matchesPerCompetitor(settings: TournamentSettings | null | undefined): number | null {
  const quota = settings?.maxRounds

  return quota != null && quota > 0 ? quota : null
}

/**
 * Whether a league is played "ida y vuelta" — the round robin run twice, so
 * every pair meets once at home and once away (see `LeagueSettings.doubleRound`).
 *
 * Only a plain league exposes the setting. Every other type ignores it:
 * interclubes already derives its own home-and-away variant from the entry
 * count (see utils/interclubs), americanos pair from the standings, and the
 * group phase of a groups+playoff was deliberately left out of the feature.
 */
export function playsDoubleRound(type: TournamentType, settings: TournamentSettings | null | undefined): boolean {
  return type === TournamentType.LEAGUE && settings?.doubleRound === true
}

/**
 * Whether a tournament runs its playoff with a consolation bracket (see
 * `PlayoffSettings.consolationBracket`). This used to be encoded as a separate
 * tournament type (`PLAYOFF_WITH_CONSOLATION`); it is now a setting of
 * `PLAYOFF` instead — see migration 016 for the one-time conversion of
 * existing rows.
 */
export function hasConsolationBracket(type: TournamentType, settings: TournamentSettings | null | undefined): boolean {
  return type === TournamentType.PLAYOFF && settings?.consolationBracket === true
}
