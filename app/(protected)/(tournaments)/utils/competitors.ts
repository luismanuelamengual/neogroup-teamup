import { getUserShortName } from '@/app/utils/users'
import { CompetitorDto } from '../models/CompetitorDto'

/**
 * Display lines for a competitor's name, in render order.
 *
 * An unlabeled multi-player competitor (tennis doubles, padel pairs) gets one
 * line per player — the whole reason a match card runs out of horizontal
 * space is cramming "L.Amengual / E. Martinez (2)" onto a single line, so
 * doubles/padel stack instead of joining with " / ". A labeled competitor
 * (interclubes team) or a singles player keeps a single line.
 *
 * The seed, when set, is appended to the LAST line — the single line for
 * singles, the second player for a pair — rather than prefixed to the first,
 * matching how score-tracking sites (e.g. padelfip.com) place it.
 */
export function getCompetitorNameLines(competitor: CompetitorDto | undefined, id: number): string[] {
  if (!competitor) {
    return [`#${id}`]
  }

  const players = competitor.players
  const names =
    !competitor.label && players != null && players.length > 1
      ? players.map((player) => getUserShortName(player))
      : [competitor.shortName]

  if (competitor.seedNumber != null) {
    const lastIndex = names.length - 1

    names[lastIndex] = `${names[lastIndex]} (${competitor.seedNumber})`
  }

  return names
}
