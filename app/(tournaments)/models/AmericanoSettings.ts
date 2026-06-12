/** Configurable scoring settings of americano tournaments. */
export interface AmericanoSettings {
  pointsPerGameWon: number
  pointsPerMatchWon: number
  swapPartnersEachRound: boolean
}

export const DEFAULT_AMERICANO_SETTINGS: AmericanoSettings = {
  pointsPerGameWon: 1,
  pointsPerMatchWon: 0,
  swapPartnersEachRound: false
}
