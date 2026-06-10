export type Profile = 'organizer' | 'player'

export type TournamentStatus = 'stand_by' | 'ongoing' | 'finished'

export type Discipline = 'padel' | 'tennis' | 'tennis_doubles'

export type TournamentType = 'league' | 'americano' | 'playoff'

export type ScoreFormat = 'three_sets' | 'two_sets_super_tiebreak' | 'basic_count'

export type MatchStatus = 'pending' | 'played' | 'walkover'

export type MatchSide = 'home' | 'away'

export type RoundStatus = 'open' | 'closed'

export interface LeagueSettings {
  pointsPerPresent: number
  pointsPerSetWon: number
  pointsPerMatchWon: number
}

export interface AmericanoSettings {
  pointsPerGameWon: number
  pointsPerMatchWon: number
  swapPartnersEachRound: boolean
}

export type TournamentSettings = Partial<LeagueSettings & AmericanoSettings>

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  pointsPerPresent: 0,
  pointsPerSetWon: 1,
  pointsPerMatchWon: 1
}

export const DEFAULT_AMERICANO_SETTINGS: AmericanoSettings = {
  pointsPerGameWon: 1,
  pointsPerMatchWon: 0,
  swapPartnersEachRound: false
}

export interface SetScore {
  home: number
  away: number
}

/**
 * Score payload stored in the matches table.
 * - three_sets / two_sets_super_tiebreak → uses `sets`
 * - basic_count → uses `home` / `away`
 * - walkover → uses `walkover` with the winning side
 */
export interface MatchScore {
  sets?: SetScore[]
  home?: number
  away?: number
  walkover?: MatchSide
}

/** True when competitors register as pairs (player + partner). */
export function isDoublesDiscipline(discipline: Discipline): boolean {
  return discipline === 'padel' || discipline === 'tennis_doubles'
}

/** Americano tournaments with partner swapping register players individually. */
export function registersAsPairs(discipline: Discipline, type: TournamentType, settings: TournamentSettings): boolean {
  if (!isDoublesDiscipline(discipline)) {
    return false
  }

  if (type === 'americano' && settings.swapPartnersEachRound) {
    return false
  }

  return true
}
