import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'

/**
 * Pure rules of the "Interclubes" tournament type — no database models
 * involved, so this module is safe to import from both server code (the
 * tournament engine, the registration services) and client components (the
 * join dialog, the score dialog, the format notice).
 *
 * An interclubes competitor is a TEAM of a venue ("sede") with N players
 * (4 minimum). Three things make the type special, and each has its own
 * section below:
 *
 *  1. **The format is derived, not configured.** The organizer picks no
 *     settings: the structure is computed from how many teams registered by
 *     the time the tournament starts (`resolveInterclubsFormat`).
 *  2. **Home advantage matters.** Playing at home is not the same as playing
 *     away, so the home/away side of every match is assigned by an explicit
 *     rotation rule instead of falling out of the round-robin circle method
 *     (`assignLocality`).
 *  3. **Teams are displayed by their venue.** Two teams of the same venue in
 *     the same category are told apart with a letter (`buildSiteLabels`).
 */

// ── format ────────────────────────────────────────────────────────────────────

/** Minimum number of players a team must register with. */
export const INTERCLUBS_MIN_TEAM_PLAYERS = 4

/** Target size of a group once the tournament outgrows a single zone. */
export const INTERCLUBS_GROUP_SIZE = 4

/** Individual matches played in every series (encuentro): always 3. */
export const INTERCLUBS_SERIES_MATCHES = 3

/** Largest number of teams that still plays as a single home-and-away league. */
export const INTERCLUBS_MAX_LEAGUE_COMPETITORS = 4

/** Shape an interclubes tournament takes for a given number of teams. */
export enum InterclubsMode {
  /** Single zone, everybody plays everybody twice (home and away). */
  DOUBLE_LEAGUE = 'DOUBLE_LEAGUE',
  /** Single-round-robin zones feeding a knockout bracket. */
  GROUPS_PLAYOFF = 'GROUPS_PLAYOFF'
}

export interface InterclubsFormat {
  mode: InterclubsMode
  /** Size of every zone, in order. A double league is a single zone. */
  groupSizes: number[]
  /** Teams advancing from each zone to the knockout (0 for a double league). */
  qualifiersPerGroup: number
  /** Total knockout entrants (0 for a double league). */
  totalQualifiers: number
}

/**
 * Resolves the structure of an interclubes tournament from its number of teams.
 *
 *  - **2 to 4 teams** → one zone played home and away: with so few teams a
 *    knockout would barely add matches, and a single round-robin would decide
 *    the title in too few games.
 *  - **more than 4** → zones of 4 plus a knockout. The number of zones is
 *    `floor(count / 4)` and the leftover teams are spread evenly over them, so
 *    zones grow rather than multiply (11 teams → 2 zones of 6 and 5, never 3
 *    zones of 4/4/3). The top 2 of each zone advance — except when everybody
 *    fits in a single zone, where the top 4 do, so there is still a knockout
 *    phase (semifinals + final) to decide the title.
 *
 * Fewer than 2 teams yields an empty format: nothing can be played.
 */
export function resolveInterclubsFormat(competitorsCount: number): InterclubsFormat {
  const count = Math.max(0, Math.floor(competitorsCount))

  if (count < 2) {
    return {
      mode: InterclubsMode.DOUBLE_LEAGUE,
      groupSizes: count > 0 ? [count] : [],
      qualifiersPerGroup: 0,
      totalQualifiers: 0
    }
  }

  if (count <= INTERCLUBS_MAX_LEAGUE_COMPETITORS) {
    return { mode: InterclubsMode.DOUBLE_LEAGUE, groupSizes: [count], qualifiersPerGroup: 0, totalQualifiers: 0 }
  }

  const groupCount = Math.max(1, Math.floor(count / INTERCLUBS_GROUP_SIZE))
  const base = Math.floor(count / groupCount)
  const remainder = count % groupCount
  const groupSizes = Array.from({ length: groupCount }, (_, index) => base + (index < remainder ? 1 : 0))
  const qualifiersPerGroup = groupCount === 1 ? 4 : 2
  const totalQualifiers = groupSizes.reduce((sum, size) => sum + Math.min(qualifiersPerGroup, size), 0)

  return { mode: InterclubsMode.GROUPS_PLAYOFF, groupSizes, qualifiersPerGroup, totalQualifiers }
}

/** True when the tournament plays its single zone home and away (2–4 teams). */
export function isInterclubsDoubleLeague(competitorsCount: number): boolean {
  return resolveInterclubsFormat(competitorsCount).mode === InterclubsMode.DOUBLE_LEAGUE
}

/**
 * Human-readable description of the structure a given number of teams
 * produces, shown to organizers and players in the tournament view so the
 * derived format is never a surprise. Returns null when there are not enough
 * teams to play anything yet.
 */
export function describeInterclubsFormat(competitorsCount: number): string | null {
  const format = resolveInterclubsFormat(competitorsCount)

  if (format.groupSizes.length === 0 || competitorsCount < 2) {
    return null
  }

  if (format.mode === InterclubsMode.DOUBLE_LEAGUE) {
    return `Con ${competitorsCount} equipos se juega una zona única de todos contra todos, ida y vuelta.`
  }

  const zones = format.groupSizes.length
  const sizes = format.groupSizes.join(', ')
  const zoneText =
    zones === 1
      ? `una zona única de ${format.groupSizes[0]} equipos`
      : `${zones} zonas de ${sizes} equipos${format.groupSizes.every((size) => size === format.groupSizes[0]) ? '' : ' respectivamente'}`
  const qualifierText =
    zones === 1
      ? `Clasifican los primeros ${format.qualifiersPerGroup} a la fase eliminatoria`
      : `Clasifican los primeros ${format.qualifiersPerGroup} de cada zona a la fase eliminatoria`

  return `Con ${competitorsCount} equipos se juega ${zoneText} (todos contra todos, una rueda). ${qualifierText}.`
}

// ── team labels ───────────────────────────────────────────────────────────────

/**
 * Spreadsheet-style suffix for the n-th (0-based) team of a venue:
 * 0 → "A", 25 → "Z", 26 → "AA", 27 → "AB", …
 */
export function getTeamLabelSuffix(index: number): string {
  let remaining = Math.max(0, Math.floor(index))
  let suffix = ''

  do {
    suffix = String.fromCharCode(65 + (remaining % 26)) + suffix
    remaining = Math.floor(remaining / 26) - 1
  } while (remaining >= 0)

  return suffix
}

/** Minimal competitor shape needed to compute team labels. */
export interface LabelableTeam {
  id: number
  siteId: number | null
  siteName: string | null
}

/**
 * Computes the label of every team of a tournament category, keyed by
 * competitor id.
 *
 * A team is shown by the name of its venue. When a venue enters more than one
 * team in the SAME category they would be indistinguishable, so each gets a
 * letter in registration order: "Alemán A", "Alemán B", … A venue with a single
 * team keeps the plain name, which means labels change as teams register and
 * unregister — hence recomputing the whole category at once rather than
 * labelling one team in isolation.
 *
 * Teams without a resolvable venue get a null label and fall back to the
 * regular roster-based display name.
 */
export function buildSiteLabels(teams: LabelableTeam[]): Map<number, string | null> {
  const bySite = new Map<number, LabelableTeam[]>()
  const labels = new Map<number, string | null>()

  for (const team of teams) {
    if (team.siteId == null || !team.siteName) {
      labels.set(team.id, null)

      continue
    }

    const group = bySite.get(team.siteId) ?? []

    group.push(team)
    bySite.set(team.siteId, group)
  }

  for (const group of bySite.values()) {
    const ordered = [...group].sort((a, b) => a.id - b.id)

    for (let index = 0; index < ordered.length; index++) {
      const team = ordered[index]

      labels.set(team.id, ordered.length === 1 ? team.siteName! : `${team.siteName} ${getTeamLabelSuffix(index)}`)
    }
  }

  return labels
}

// ── home / away (localía) ─────────────────────────────────────────────────────

/** Minimal match shape needed to decide who plays at home. */
export interface LocalityMatch {
  id: number
  roundNumber: number
  homeCompetitorId: number | null
  awayCompetitorId: number | null
}

/** A matchup whose home/away sides have not been decided yet. */
export interface LocalityPair {
  first: number
  second: number
  position: number
}

/** A matchup with its sides resolved. */
export interface LocalitySides {
  home: number
  away: number
  position: number
}

/**
 * Deterministic 32-bit hash (FNV-1a) used as the last-resort coin flip.
 *
 * The rule below ends in "otherwise at random", but real randomness cannot be
 * used here: the engine deletes and rebuilds rounds whenever an earlier result
 * is corrected (`rebuildLaneFrom`, knockout reseeding), so a `Math.random()`
 * coin flip would silently swap who plays at home every time an unrelated
 * score is edited. Hashing the (stable) matchup identity instead gives a
 * distribution that is just as arbitrary between any two clubs, but always
 * lands on the same answer for the same matchup.
 */
function hashKey(value: string): number {
  let hash = 2166136261

  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

/** Encounters between two competitors, oldest first. */
function encountersBetween(first: number, second: number, matches: LocalityMatch[]): LocalityMatch[] {
  return matches
    .filter((match) => {
      const away = match.awayCompetitorId

      if (away == null) {
        return false
      }

      return (
        (match.homeCompetitorId === first && away === second) || (match.homeCompetitorId === second && away === first)
      )
    })
    .sort((a, b) => a.roundNumber - b.roundNumber || a.id - b.id)
}

/** How many times each competitor has been the home side so far. */
function countHomeGames(matches: LocalityMatch[]): Map<number, number> {
  const counts = new Map<number, number>()

  for (const match of matches) {
    // A bye / placeholder has no away side: nobody was really "home" in it.
    if (match.awayCompetitorId == null || match.homeCompetitorId == null) {
      continue
    }

    counts.set(match.homeCompetitorId, (counts.get(match.homeCompetitorId) ?? 0) + 1)
  }

  return counts
}

/**
 * Decides which of two teams plays at home, following the interclubes rule:
 *
 *  1. If they already met in this tournament, the localía is **inverted**:
 *     whoever visited last time now hosts. (With several previous meetings the
 *     most recent one is the reference, so a third meeting flips back again.)
 *  2. Otherwise the team that has hosted **fewer** times so far hosts, which
 *     keeps home games evenly spread across the tournament.
 *  3. On a tie, an arbitrary but reproducible pick (see `hashKey`).
 *
 * `previousMatches` should hold every match of the category — both zone and
 * knockout lanes — since the rule spans the whole tournament, not a single
 * phase.
 */
export function resolveLocality(
  first: number,
  second: number,
  previousMatches: LocalityMatch[],
  tieBreakKey: string | number = ''
): { home: number; away: number } {
  const encounters = encountersBetween(first, second, previousMatches)
  const last = encounters[encounters.length - 1]

  if (last) {
    // Invert: the previous away side hosts now.
    const previousHome = last.homeCompetitorId === first ? first : second

    return previousHome === first ? { home: second, away: first } : { home: first, away: second }
  }

  const homeGames = countHomeGames(previousMatches)
  const firstCount = homeGames.get(first) ?? 0
  const secondCount = homeGames.get(second) ?? 0

  if (firstCount !== secondCount) {
    return firstCount < secondCount ? { home: first, away: second } : { home: second, away: first }
  }

  const low = Math.min(first, second)
  const high = Math.max(first, second)
  const firstHosts = hashKey(`${low}:${high}:${tieBreakKey}`) % 2 === 0

  return firstHosts ? { home: low, away: high } : { home: high, away: low }
}

/**
 * Applies `resolveLocality` to every matchup of a round. Sides assigned earlier
 * in the same round are taken into account for the ones assigned after them, so
 * a round is internally consistent even in the (currently impossible) case of a
 * team appearing twice in it.
 */
export function assignLocality(
  pairs: LocalityPair[],
  previousMatches: LocalityMatch[],
  roundNumber: number
): LocalitySides[] {
  const known = [...previousMatches]
  const resolved: LocalitySides[] = []
  // Synthetic ids for the matches decided in this very round, kept above any
  // real id so they always sort last as "most recent".
  let syntheticId = Number.MAX_SAFE_INTEGER - pairs.length

  for (const pair of pairs) {
    const sides = resolveLocality(pair.first, pair.second, known, `${roundNumber}:${pair.position}`)

    resolved.push({ ...sides, position: pair.position })
    known.push({
      id: syntheticId++,
      roundNumber,
      homeCompetitorId: sides.home,
      awayCompetitorId: sides.away
    })
  }

  return resolved
}

/**
 * Home/away order for an already-formed matchup, used by the knockout bracket:
 * there the two sides come from the bracket structure (the winners of the
 * feeder matches), so the localía only decides which of them is written into
 * the home slot. Returns the pair as `[home, away]`.
 */
export function orderKnockoutSides(
  home: number,
  away: number,
  previousMatches: LocalityMatch[],
  tieBreakKey: string | number
): [number, number] {
  const sides = resolveLocality(home, away, previousMatches, tieBreakKey)

  return [sides.home, sides.away]
}

// ── series score ──────────────────────────────────────────────────────────────

/** Winner of a series from its individual match results (best of 3). */
export function getSeriesSideWinner(homeWins: number, awayWins: number): MatchSide | null {
  if (homeWins === awayWins) {
    return null
  }

  return homeWins > awayWins ? MatchSide.HOME : MatchSide.AWAY
}
