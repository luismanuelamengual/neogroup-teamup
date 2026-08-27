/**
 * The circle-method round robin, on its own.
 *
 * These are the pure functions that decide WHO plays whom in every round-robin
 * flow of the app (a league, an americano, a group of a groups+playoff, an
 * interclubes zone). They live apart from the engine (utils/tournaments.ts)
 * because that module is database-backed and therefore cannot be imported from a
 * client component — while the exact same pairings have to be reproducible on
 * the client, to check that a category's derived group membership really is the
 * one being played (see `derivationReproducesPlay` in utils/lateRegistration).
 */

/**
 * A single fixture of a round.
 *
 * `home`/`away` are null while that side is not yet known (a knockout "to be
 * defined" placeholder); `away` is also null for a permanent bye/void slot —
 * `persistRoundMatches` decides the resulting status from context, so the two
 * null cases never need to be told apart by the id alone.
 */
export interface Pairing {
  home: number | null
  away: number | null
  position: number
}

/** Round-robin rounds needed for `size` competitors (circle method). */
export function roundRobinRoundsFor(size: number): number {
  if (size < 2) {
    return 0
  }

  return size % 2 === 0 ? size - 1 : size
}

/**
 * Rounds a league lasts: the round robin, run twice when it is played
 * "ida y vuelta" (see `LeagueSettings.doubleRound`).
 */
export function leagueRoundsFor(size: number, doubleRound: boolean): number {
  return roundRobinRoundsFor(size) * (doubleRound ? 2 : 1)
}

/**
 * Circle-method round robin. Returns the pairs for a 1-based round number.
 * With an odd number of participants a null "bye" slot is added; pairs that
 * include the bye are skipped.
 *
 * That null slot is what makes late registration into an odd round robin
 * possible: appending a competitor to `ids` puts them exactly where it sat, so
 * every other pair comes out unchanged (see utils/lateRegistration).
 */
export function roundRobinPairs(ids: number[], roundNumber: number): [number | null, number | null][] {
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

    pairings.push({ home, away, position: position++ })
  }

  return pairings
}

/**
 * League round robin, with the optional return leg ("ida y vuelta").
 *
 * Rounds beyond the first full round robin replay it from the start with the
 * two sides swapped, so a pair that met at home in the "ida" meets away in the
 * "vuelta". Rounds past the end of the (possibly doubled) schedule produce
 * nothing.
 *
 * The circle method is already periodic in the round number, so the wrap-around
 * is only made explicit here — what this adds is the side inversion, and the
 * empty result past the last round.
 */
export function generateLeagueRound(competitorIds: number[], roundNumber: number, doubleRound: boolean): Pairing[] {
  const totalRounds = roundRobinRoundsFor(competitorIds.length)

  if (totalRounds === 0 || roundNumber > leagueRoundsFor(competitorIds.length, doubleRound)) {
    return []
  }

  const returnLeg = roundNumber > totalRounds
  const pairings = generateRoundRobinRound(competitorIds, returnLeg ? roundNumber - totalRounds : roundNumber)

  if (!returnLeg) {
    return pairings
  }

  return pairings.map((pairing) => ({ home: pairing.away, away: pairing.home, position: pairing.position }))
}
