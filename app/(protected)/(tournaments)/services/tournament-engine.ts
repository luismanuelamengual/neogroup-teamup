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

/** Total number of rounds for a tournament given its competitors count. */
export function getTotalRounds(type: TournamentType, settings: TournamentSettings, competitorsCount: number): number {
  if (competitorsCount < 2) {
    return 0
  }

  switch (type) {
    case TournamentType.LEAGUE:
      return competitorsCount % 2 === 0 ? competitorsCount - 1 : competitorsCount

    case TournamentType.AMERICANO: {
      if (settings.swapPartnersEachRound) {
        // Individuals rotate partners: one round per circle-method rotation.
        const slots = competitorsCount % 2 === 0 ? competitorsCount : competitorsCount + 1

        return slots - 1
      }

      return competitorsCount % 2 === 0 ? competitorsCount - 1 : competitorsCount
    }

    case TournamentType.PLAYOFF:
      return Math.ceil(Math.log2(competitorsCount))
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
function generateRoundRobinRound(competitorIds: number[], roundNumber: number): Pairing[] {
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
 * Playoff bracket. Round 1 seeds competitors in registration order over the
 * next power of two, giving byes to the top seeds. Later rounds pair the
 * winners of the two previous matches at adjacent bracket positions.
 * Bye matches must be persisted as already played with winner "home".
 */
function generatePlayoffRound(competitorIds: number[], roundNumber: number, previousRoundMatches: Match[]): Pairing[] {
  if (roundNumber === 1) {
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(Math.max(competitorIds.length, 2))))
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
  }
}
