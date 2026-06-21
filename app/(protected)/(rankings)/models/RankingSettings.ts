import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'

/**
 * Configuration (stored as JSONB in tournaments.rankingSettings) describing how
 * many ranking points each finishing placement of the tournament grants. It is
 * a flat map keyed by a stable "placement key" so the same shape covers every
 * tournament type:
 *
 *  - League / Americano  → numeric positions: `position_1`, `position_2`, ...
 *  - Knockout (playoff / groups+playoff main bracket) → bracket stages:
 *      `winner`, `finalist`, `semifinalist`, `quarterfinalist`, `round_16`, `round_32`
 *  - Playoff with consolation → the knockout stages above PLUS the consolation
 *      bracket stages, prefixed with `consolation_`.
 */
export interface RankingSettings {
  /** Points granted per placement key. Missing / non-positive values grant nothing. */
  points: Record<string, number>
}

/** Which input scheme the ranking configuration uses for a given tournament type. */
export enum RankingScheme {
  /** Numeric finishing positions (1st, 2nd, 3rd...). */
  POSITION = 'position',
  /** Knockout bracket stages (winner, finalist, semifinalist...). */
  KNOCKOUT = 'knockout',
  /** Knockout bracket stages plus a consolation bracket. */
  KNOCKOUT_WITH_CONSOLATION = 'knockout_consolation'
}

/** Ordered knockout stage keys, from the final backwards (index = distance to the final). */
export const KNOCKOUT_STAGE_KEYS = [
  'finalist',
  'semifinalist',
  'quarterfinalist',
  'round_16',
  'round_32',
  'round_64'
] as const

/** Consolation prefix applied to a knockout stage key. */
export const CONSOLATION_PREFIX = 'consolation_'

/** Number of numeric positions exposed by the POSITION scheme. */
export const POSITION_COUNT = 8

/** Resolves the ranking configuration scheme for a tournament type. */
export function getRankingScheme(type: TournamentType): RankingScheme {
  switch (type) {
    case TournamentType.PLAYOFF:
    case TournamentType.GROUPS_PLAYOFF:
      return RankingScheme.KNOCKOUT
    case TournamentType.PLAYOFF_WITH_CONSOLATION:
      return RankingScheme.KNOCKOUT_WITH_CONSOLATION
    default:
      return RankingScheme.POSITION
  }
}

/** Placement key for a numeric finishing position (1-based). */
export function positionKey(position: number): string {
  return `position_${position}`
}

/** Placement key for a knockout stage (optionally in the consolation bracket). */
export function knockoutStageKey(stage: string, consolation = false): string {
  return consolation ? `${CONSOLATION_PREFIX}${stage}` : stage
}

/** Default points per placement for a freshly selected tournament type. */
export function getDefaultRankingSettings(type: TournamentType): RankingSettings {
  const scheme = getRankingScheme(type)
  const points: Record<string, number> = {}

  if (scheme === RankingScheme.POSITION) {
    const defaults = [100, 70, 50, 35, 25, 18, 12, 8]

    for (let i = 0; i < POSITION_COUNT; i++) {
      points[positionKey(i + 1)] = defaults[i] ?? 0
    }

    return { points }
  }

  const stageDefaults: Record<string, number> = {
    winner: 100,
    finalist: 70,
    semifinalist: 45,
    quarterfinalist: 25,
    round_16: 15,
    round_32: 8,
    round_64: 4
  }

  points.winner = stageDefaults.winner

  for (const stage of KNOCKOUT_STAGE_KEYS) {
    points[stage] = stageDefaults[stage] ?? 0
  }

  if (scheme === RankingScheme.KNOCKOUT_WITH_CONSOLATION) {
    const consolationDefaults: Record<string, number> = {
      winner: 30,
      finalist: 20,
      semifinalist: 12,
      quarterfinalist: 6,
      round_16: 3,
      round_32: 2,
      round_64: 1
    }

    points[knockoutStageKey('winner', true)] = consolationDefaults.winner

    for (const stage of KNOCKOUT_STAGE_KEYS) {
      points[knockoutStageKey(stage, true)] = consolationDefaults[stage] ?? 0
    }
  }

  return { points }
}
