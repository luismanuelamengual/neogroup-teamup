import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { isKnockoutType, MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { resolveSlotLabels, roundLabel } from '@/app/(protected)/(tournaments)/utils/bracket'
import { resolveCompetitorSiteId } from '@/app/(protected)/(tournaments)/utils/groups'
import { foldForSearch } from '@/app/utils/text'

/**
 * The view model both planners share: the list of matches that can be placed on
 * a calendar, already resolved into the strings a card (and a PDF cell) needs.
 *
 * It lives apart from the components because there are two of them — the
 * regular planner (courts of one venue) and the interclubes one (slots, and a
 * venue that is usually derived rather than chosen) — and they must describe a
 * match identically. It is also pure, so the derivation can be exercised
 * without rendering anything.
 */

/** First selectable start time: 8:00 (in minutes from midnight). */
export const DAY_START_MIN = 8 * 60
/** Last selectable start time: 23:00. */
export const DAY_END_MIN = 23 * 60
/** Slot granularity: matches can be placed every 30 minutes. */
export const SLOT_MIN = 30
/** Pixel height of a 30-minute slot in the planning grid. */
export const ROW_HEIGHT = 44
/** Default duration of a match, in minutes (1h30). */
export const DEFAULT_DURATION = 90
export const DURATION_OPTIONS = [30, 60, 90, 120, 150, 180]
/** Maximum number of days that can be planned at once. */
export const MAX_PLANNING_DAYS = 10

/** All selectable start slots (8:00 … 23:00). */
export const SLOTS: number[] = (() => {
  const slots: number[] = []

  for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += SLOT_MIN) {
    slots.push(m)
  }

  return slots
})()

export function minToLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Parses an 'HH:mm' stored hour back into minutes from midnight. */
export function labelToMin(hour: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hour)

  if (!match) {
    return null
  }

  return Number(match[1]) * 60 + Number(match[2])
}

/** Where a match has been placed in the planning grid. */
export interface Placement {
  dateIso: string
  /** 1-based court number — the interclubes planner stores its slot here. */
  court: number
  /** Start time in minutes from midnight. */
  startMin: number
}

/**
 * A normalized view of a schedulable match, so the pool, grid, drag ghost and
 * PDF export can all treat them the same way.
 */
export interface PlannerEntry {
  id: number
  /** Tournament category the match belongs to, for the pool's category filter. */
  categoryId: number
  category: string
  round: string | null
  home: string
  away: string
  /**
   * True when a side holds a derived description ("Ganador de A vs B") rather
   * than a real competitor, so it can be rendered as the placeholder it is.
   */
  homePlaceholder: boolean
  awayPlaceholder: boolean
  /** Everything this match can be searched by, pre-folded (see foldForSearch). */
  searchText: string
  /** True when the match belongs to the consolation knockout bracket. */
  consolation: boolean
  /**
   * A match that already has a result. It stays visible in the grid so the day's
   * schedule still reflects what happened, but it can no longer be moved or
   * unscheduled.
   */
  locked: boolean
  /**
   * Venue of the home side, when it can be derived from the competitor itself
   * (interclubes teams carry the club they represent). Null for every other
   * type, where the venue is the organizer's choice rather than a property of
   * the match — see resolveCompetitorSiteId.
   */
  homeSiteId: number | null
}

export interface PlannerEntriesOptions {
  /**
   * Label round-robin matches too, with the zone and fixture they belong to
   * ("Zona 2 · Fecha 3"). Only the interclubes sheet asks for this: everywhere
   * else the round is a knockout stage or nothing, and a "Fecha N" on every
   * league card would be noise.
   */
  zoneLabels?: boolean
}

/**
 * Everything the planner cares about of a tournament: every match still waiting
 * for a result, plus the ones already scheduled — including those that have
 * since been played, so a day's grid keeps showing what actually took place.
 *
 * "Waiting for a result" is deliberately the only condition: no editability
 * check, no requirement that both sides be known. The organizer books courts
 * for the whole tournament at once, not lane frontier by lane frontier, and a
 * not-yet-defined bracket match still needs a slot reserved for it — the names
 * drop in on their own once the feeders resolve (the server never touches the
 * schedule when it propagates winners).
 */
export function buildPlannerEntries(
  tournament: TournamentDto | null,
  { zoneLabels = false }: PlannerEntriesOptions = {}
): PlannerEntry[] {
  if (!tournament) {
    return []
  }

  const matches = tournament.matches ?? []
  const competitors = tournament.competitors ?? []
  const competitorsById: Record<number, CompetitorDto> = Object.fromEntries(competitors.map((c) => [c.id, c]))
  // Category display name for each tournament category, matching the pattern
  // used elsewhere in the app (falls back to "Categoría única" when the
  // tournament has no organizer-defined categories).
  const categoryNameById = new Map(
    (tournament.categories ?? []).map((c) => [c.id, c.category?.name ?? 'Categoría única'])
  )
  const roundLabelByMatchId = buildRoundLabels(matches, zoneLabels)
  // Matches that belong to the consolation knockout bracket, so they can be
  // flagged as "Consuelo" in the grid and the PDF.
  const consolationMatchIds = new Set(
    matches.filter((match) => match.type === MatchType.CONSOLATION_BRACKET).map((match) => match.id)
  )
  // Matches grouped by category: deriving a bracket slot's description needs the
  // whole category, since a match is described by the ones that feed it.
  const matchesByCategory = new Map<number, MatchDto[]>()

  for (const match of matches) {
    if (!matchesByCategory.has(match.tournamentCategoryId)) {
      matchesByCategory.set(match.tournamentCategoryId, [])
    }

    matchesByCategory.get(match.tournamentCategoryId)!.push(match)
  }

  // Every name a competitor can be found by, folded once per competitor rather
  // than on each keystroke. Both the long and the short name are indexed: the
  // cards show the short one, but people type what they know.
  const searchIndex = new Map(
    competitors.map((competitor) => [competitor.id, foldForSearch(`${competitor.displayName} ${competitor.shortName}`)])
  )

  /** Same seed placement as MatchCard — appended at the end, in parentheses — but kept on one line. */
  const sideName = (id: number | null): string => {
    if (id == null) {
      return '—'
    }

    const competitor = competitorsById[id]

    if (!competitor) {
      return `#${id}`
    }

    return competitor.seedNumber != null ? `${competitor.shortName} (${competitor.seedNumber})` : competitor.shortName
  }

  /**
   * Names for the derived slot descriptions. The seed prefix is dropped here on
   * purpose: "Ganador de Amengual (1) vs Gutierrez (4)" is already a long string
   * for a 260px column, and the seeds add nothing once the sentence itself says
   * which match it refers to.
   */
  const plainSideName = (id: number): string => competitorsById[id]?.shortName ?? `#${id}`
  // Byes and walkovers are not PENDING, so they never reach the pool.
  const awaitsResult = (match: MatchDto) =>
    match.status === MatchStatus.PENDING && match.score == null && match.winner == null

  return (
    matches
      // A voided fixture will never be played: it is dropped even if it was
      // scheduled before being voided, so it leaves no ghost behind in the grid.
      .filter((match) => match.status !== MatchStatus.VOID && (awaitsResult(match) || match.date != null))
      .map((match) => {
        // A future bracket match has empty sides. Rather than two dashes, describe
        // where each side will come from ("Ganador de Amengual vs Gutierrez").
        const slots = resolveSlotLabels(match, matchesByCategory.get(match.tournamentCategoryId) ?? [], plainSideName)
        const homePlaceholder = match.homeCompetitorId == null && slots.home != null
        const awayPlaceholder = match.awayCompetitorId == null && slots.away != null
        const home = homePlaceholder ? slots.home! : sideName(match.homeCompetitorId)
        const away = awayPlaceholder ? slots.away! : sideName(match.awayCompetitorId)
        // Searchable by the real competitors AND by the derived descriptions, so
        // typing "amengual" also surfaces the "Ganador de Amengual vs …" slot.
        const searchText = foldForSearch(
          [
            ...[match.homeCompetitorId, match.awayCompetitorId]
              .filter((id): id is number => id != null)
              .map((id) => searchIndex.get(id) ?? ''),
            homePlaceholder ? home : '',
            awayPlaceholder ? away : ''
          ].join(' ')
        )
        const homeCompetitor = match.homeCompetitorId != null ? competitorsById[match.homeCompetitorId] : undefined

        return {
          id: match.id,
          categoryId: match.tournamentCategoryId,
          category: categoryNameById.get(match.tournamentCategoryId) ?? 'Categoría única',
          round: roundLabelByMatchId.get(match.id) ?? null,
          home,
          away,
          homePlaceholder,
          awayPlaceholder,
          searchText,
          consolation: consolationMatchIds.has(match.id),
          locked: match.status !== MatchStatus.PENDING || match.score != null,
          homeSiteId: homeCompetitor ? resolveCompetitorSiteId(homeCompetitor) : null
        }
      })
  )
}

/**
 * Stage label for every match that has one.
 *
 * Knockout rounds are named the same way BracketView does: rounds are grouped
 * by category + bracket (main/consolation) and counted from the last one back,
 * so the last round of each bracket is the "Final". With `zoneLabels` the
 * round-robin matches are named too, by the zone and fixture they belong to.
 */
function buildRoundLabels(matches: MatchDto[], zoneLabels: boolean): Map<number, string> {
  const result = new Map<number, string>()
  // Group knockout matches by category + bracket (main/consolation).
  const groups = new Map<string, MatchDto[]>()

  for (const match of matches) {
    if (!isKnockoutType(match.type)) {
      continue
    }

    const key = `${match.tournamentCategoryId}-${match.type}`
    const list = groups.get(key) ?? []

    list.push(match)
    groups.set(key, list)
  }

  for (const list of groups.values()) {
    const roundNumbers = [...new Set(list.map((m) => m.roundNumber))].sort((a, b) => a - b)
    const total = roundNumbers.length

    roundNumbers.forEach((roundNumber, index) => {
      const roundMatches = list.filter((m) => m.roundNumber === roundNumber)
      const label = roundLabel(index, total, roundMatches.length)

      for (const match of roundMatches) {
        result.set(match.id, label)
      }
    })
  }

  if (!zoneLabels) {
    return result
  }

  // Zones are numbered per category, in the same order GroupsView tabs them:
  // by group number, from 1. A category played as a single zone says so rather
  // than calling itself "Zona 1", which is how the printed programmes read.
  const zoneNumbersByCategory = new Map<number, number[]>()

  for (const match of matches) {
    if (match.type !== MatchType.LEAGUE || match.groupNumber == null) {
      continue
    }

    const numbers = zoneNumbersByCategory.get(match.tournamentCategoryId) ?? []

    if (!numbers.includes(match.groupNumber)) {
      numbers.push(match.groupNumber)
      zoneNumbersByCategory.set(match.tournamentCategoryId, numbers)
    }
  }

  for (const numbers of zoneNumbersByCategory.values()) {
    numbers.sort((a, b) => a - b)
  }

  for (const match of matches) {
    if (match.type !== MatchType.LEAGUE) {
      continue
    }

    const fixture = `Fecha ${match.roundNumber}`

    if (match.groupNumber == null) {
      // No zones at all: a single home-and-away league, where the only thing
      // that tells two meetings of the same teams apart is the fixture.
      result.set(match.id, fixture)

      continue
    }

    const numbers = zoneNumbersByCategory.get(match.tournamentCategoryId) ?? []
    const zone = numbers.length <= 1 ? 'Zona única' : `Zona ${numbers.indexOf(match.groupNumber) + 1}`

    result.set(match.id, `${zone} · ${fixture}`)
  }

  return result
}
