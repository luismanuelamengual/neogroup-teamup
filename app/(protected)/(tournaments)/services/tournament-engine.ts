import { DEFAULT_GROUPS_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/GroupsPlayoffSettings'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { TournamentSettings } from '@/app/(protected)/(tournaments)/models/TournamentSettings'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'

/**
 * Pure functions that compute the pairings of every tournament round.
 * Competitors are referenced by id. A side holds one competitor id, except in
 * americano tournaments with partner swapping where two individual competitors
 * team up for the round.
 */

export interface Pairing {
  home: number[]
  away: number[] | null
  position: number
}

/** Round-robin rounds needed for `size` competitors (circle method). */
function roundRobinRoundsFor(size: number): number {
  if (size < 2) {
    return 0
  }

  return size % 2 === 0 ? size - 1 : size
}

/** Knockout rounds (to the final) needed for `entrants` competitors. */
export function getKnockoutRounds(entrants: number): number {
  return entrants < 2 ? 0 : Math.ceil(Math.log2(entrants))
}

/** Power-of-two bracket size that fits `entrants` (min 2). */
export function getBracketSize(entrants: number): number {
  return Math.pow(2, Math.ceil(Math.log2(Math.max(entrants, 2))))
}

/**
 * Balanced group sizes for `competitorsCount` competitors targeting
 * `groupSize` per group. The number of groups is derived from the registered
 * competitors (ceil division); the remainder is spread across the first groups.
 */
export function computeGroupSizes(competitorsCount: number, groupSize: number): number[] {
  const safeGroupSize = Math.max(2, Math.floor(groupSize) || 2)
  const groupCount = Math.max(1, Math.ceil(competitorsCount / safeGroupSize))
  const base = Math.floor(competitorsCount / groupCount)
  const remainder = competitorsCount % groupCount

  return Array.from({ length: groupCount }, (_, index) => base + (index < remainder ? 1 : 0))
}

/**
 * Distributes competitor ids into balanced groups (round-robin assignment, so
 * groups end up as even as possible). Deterministic: the same ordered input
 * always yields the same groups.
 */
export function assignGroups(competitorIds: number[], groupSize: number): number[][] {
  const groupCount = computeGroupSizes(competitorIds.length, groupSize).length
  const groups: number[][] = Array.from({ length: groupCount }, () => [])

  competitorIds.forEach((id, index) => {
    groups[index % groupCount].push(id)
  })

  return groups
}

/**
 * Cross-seeds the knockout phase of a groups+playoff tournament. `qualifiers`
 * is ordered per group (index 0 is the group winner). Returns a flat seeded
 * lineup where every rank tier is grouped together (all winners first, then all
 * runners-up, ...). Fed to the standard bracket seeding this makes group
 * winners earn the byes and keeps competitors from the same group apart in the
 * first round.
 */
export function seedFromGroups(qualifiers: number[][]): number[] {
  const maxRank = qualifiers.reduce((max, group) => Math.max(max, group.length), 0)
  const seeded: number[] = []

  for (let rank = 0; rank < maxRank; rank++) {
    for (const group of qualifiers) {
      if (group[rank] !== undefined) {
        seeded.push(group[rank])
      }
    }
  }

  return seeded
}

/** Total number of rounds for a tournament given its competitors count. */
export function getTotalRounds(type: TournamentType, settings: TournamentSettings, competitorsCount: number): number {
  if (competitorsCount < 2) {
    return 0
  }

  switch (type) {
    case TournamentType.LEAGUE:
      return roundRobinRoundsFor(competitorsCount)

    case TournamentType.AMERICANO: {
      if (settings.swapPartnersEachRound) {
        // Individuals rotate partners: one round per circle-method rotation.
        const slots = competitorsCount % 2 === 0 ? competitorsCount : competitorsCount + 1

        return slots - 1
      }

      return roundRobinRoundsFor(competitorsCount)
    }

    case TournamentType.PLAYOFF:
      // A consolation bracket (when enabled) runs in parallel with the main one
      // and finishes on the same round, so it does not add rounds.
      return getKnockoutRounds(competitorsCount)

    case TournamentType.GROUPS_PLAYOFF: {
      const groupSize = settings.competitorsPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.competitorsPerGroup
      const qualifiers = settings.qualifiersPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.qualifiersPerGroup
      const sizes = computeGroupSizes(competitorsCount, groupSize)
      const groupRounds = sizes.reduce((max, size) => Math.max(max, roundRobinRoundsFor(size)), 0)
      const totalQualifiers = sizes.reduce((sum, size) => sum + Math.min(Math.max(1, qualifiers), size), 0)

      return groupRounds + getKnockoutRounds(totalQualifiers)
    }
  }
}

/**
 * Maximum number of rounds across every category group. When a tournament has
 * categories each one runs in parallel and they may have different sizes, so
 * the tournament lasts as long as its largest group.
 */
export function getMaxTotalRounds(type: TournamentType, settings: TournamentSettings, groupSizes: number[]): number {
  return groupSizes.reduce((max, size) => Math.max(max, getTotalRounds(type, settings, size)), 0)
}

/** Group-phase rounds of a groups+playoff category (round-robin, largest group). */
export function getGroupPhaseRounds(settings: TournamentSettings, competitorsCount: number): number {
  const groupSize = settings.competitorsPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.competitorsPerGroup

  return computeGroupSizes(competitorsCount, groupSize).reduce(
    (max, size) => Math.max(max, roundRobinRoundsFor(size)),
    0
  )
}

/**
 * Circle-method round robin. Returns the pairs for a 1-based round number.
 * With an odd number of participants a null "bye" slot is added; pairs that
 * include the bye are skipped.
 */
function roundRobinPairs(ids: number[], roundNumber: number): [number | null, number | null][] {
  const slots: (number | null)[] = [...ids]

  if (slots.length % 2 !== 0) {
    slots.push(null)
  }

  const count = slots.length
  const fixed = slots[0]
  const rotating = slots.slice(1)
  const rotation = (roundNumber - 1) % (count - 1)
  const rotated = [...rotating.slice(rotation), ...rotating.slice(0, rotation)]
  const lineup = [fixed, ...rotated]
  const pairs: [number | null, number | null][] = []

  for (let i = 0; i < count / 2; i++) {
    pairs.push([lineup[i], lineup[count - 1 - i]])
  }

  return pairs
}

/** League and fixed-pairs americano: classic round robin between competitors. */
export function generateRoundRobinRound(competitorIds: number[], roundNumber: number): Pairing[] {
  const pairs = roundRobinPairs(competitorIds, roundNumber)
  const pairings: Pairing[] = []
  let position = 0

  for (const [home, away] of pairs) {
    if (home == null || away == null) {
      continue
    }

    pairings.push({ home: [home], away: [away], position: position++ })
  }

  return pairings
}

/**
 * Americano with partner swapping: individuals are paired with a different
 * partner each round (circle method) and the resulting teams are matched
 * sequentially. With an odd team count the last team rests.
 */
function generateAmericanoSwapRound(competitorIds: number[], roundNumber: number): Pairing[] {
  const partnerships = roundRobinPairs(competitorIds, roundNumber).filter(
    (pair): pair is [number, number] => pair[0] != null && pair[1] != null
  )
  const pairings: Pairing[] = []
  let position = 0

  for (let i = 0; i + 1 < partnerships.length; i += 2) {
    pairings.push({
      home: [partnerships[i][0], partnerships[i][1]],
      away: [partnerships[i + 1][0], partnerships[i + 1][1]],
      position: position++
    })
  }

  return pairings
}

/**
 * First-round pairings of a knockout bracket. Competitors are seeded in the
 * given order over the next power of two, giving byes to the top seeds.
 * Bye matches (away === null) must be persisted as already played, won by home.
 */
export function seedPlayoffPairings(competitorIds: number[]): Pairing[] {
  const bracketSize = getBracketSize(competitorIds.length)
  const seeds: (number | null)[] = new Array(bracketSize).fill(null)

  competitorIds.forEach((id, index) => {
    seeds[index] = id
  })

  const order = buildBracketOrder(bracketSize)
  const pairings: Pairing[] = []

  for (let i = 0; i < bracketSize / 2; i++) {
    const home = seeds[order[i * 2]]
    const away = seeds[order[i * 2 + 1]]

    if (home == null && away == null) {
      continue
    }

    pairings.push({
      home: [home ?? (away as number)],
      away: home == null ? null : away == null ? null : [away],
      position: i
    })
  }

  return pairings
}

/** Winners of `previousRoundMatches`, paired up into the next bracket round. */
export function advancePlayoffPairings(previousRoundMatches: Match[]): Pairing[] {
  const sorted = [...previousRoundMatches].sort((a, b) => a.position - b.position)
  const winners = sorted.map((match) => {
    if (match.winner === MatchSide.HOME) {
      return match.homeCompetitorIds[0]
    }

    if (match.winner === MatchSide.AWAY && match.awayCompetitorIds) {
      return match.awayCompetitorIds[0]
    }

    return null
  })
  const pairings: Pairing[] = []

  for (let i = 0; i + 1 < winners.length; i += 2) {
    const home = winners[i]
    const away = winners[i + 1]

    if (home == null && away == null) {
      continue
    }

    pairings.push({
      home: [home ?? (away as number)],
      away: home == null || away == null ? null : [away],
      position: i / 2
    })
  }

  return pairings
}

/**
 * Playoff bracket. Round 1 seeds competitors in registration order over the
 * next power of two, giving byes to the top seeds. Later rounds pair the
 * winners of the two previous matches at adjacent bracket positions.
 */
function generatePlayoffRound(competitorIds: number[], roundNumber: number, previousRoundMatches: Match[]): Pairing[] {
  return roundNumber === 1 ? seedPlayoffPairings(competitorIds) : advancePlayoffPairings(previousRoundMatches)
}

/**
 * Standard bracket seeding order (1 vs lowest seed, etc.) so the best seeds
 * can only meet in late rounds. Returns seed indexes (0-based).
 */
function buildBracketOrder(bracketSize: number): number[] {
  let order = [0]

  while (order.length < bracketSize) {
    const next: number[] = []
    const size = order.length * 2

    for (const seed of order) {
      next.push(seed)
      next.push(size - 1 - seed)
    }

    order = next
  }

  return order
}

/** Computes the pairings for the given (1-based) round of a tournament. */
export function generateRoundPairings(
  type: TournamentType,
  settings: TournamentSettings,
  competitorIds: number[],
  roundNumber: number,
  previousRoundMatches: Match[]
): Pairing[] {
  switch (type) {
    case TournamentType.LEAGUE:
      return generateRoundRobinRound(competitorIds, roundNumber)

    case TournamentType.AMERICANO:
      return settings.swapPartnersEachRound
        ? generateAmericanoSwapRound(competitorIds, roundNumber)
        : generateRoundRobinRound(competitorIds, roundNumber)

    case TournamentType.PLAYOFF:
      return generatePlayoffRound(competitorIds, roundNumber, previousRoundMatches)

    case TournamentType.GROUPS_PLAYOFF:
      // Groups+playoff rounds are generated bracket-by-bracket by the helpers.
      return []
  }
}
