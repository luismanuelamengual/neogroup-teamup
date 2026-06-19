/** Configurable scoring settings of americano tournaments. */
export interface AmericanoSettings {
  pointsPerGameWon: number
  pointsPerMatchWon: number
  /** Optional cap on the number of rounds (tournament ends after this many rounds). */
  maxRounds?: number
}

export const DEFAULT_AMERICANO_SETTINGS: AmericanoSettings = {
  pointsPerGameWon: 1,
  pointsPerMatchWon: 0
}
