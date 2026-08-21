/**
 * Which days the published schedule covers.
 *
 * The planner is the organizer's tool and spans whatever range they pick; the
 * schedule a player opens has nobody to pick it, so the range is derived. What
 * a player wants is "the block of play that is about to happen (or is happening
 * now)", which is not the same as "the whole tournament": a league that runs
 * every weekend for two months would otherwise open on a wall of dates, most of
 * them weeks away.
 *
 * So the window is found in two steps:
 *
 *   1. Look ahead a week from today for the first day that has any match
 *      planned. Today counts as the first of those days — a tournament being
 *      played right now is the most likely reason to open this screen at all.
 *      Nothing planned in that week means nothing to publish.
 *   2. From that day, keep going while the play does. The block ends where two
 *      days in a row have no matches: a one-day pause inside a weekend
 *      (Saturday and Monday, say) is still the same block of play, while two
 *      empty days mean the next matches belong to the following one and will
 *      show up on their own once they are within the week ahead.
 *
 * Only days that actually hold matches are returned — an empty day inside the
 * block is what joins the two halves together, not something to print.
 *
 * Dates are handled as plain 'YYYY-MM-DD' strings (the shape `matches.date`
 * stores) and compared as such: no timezone is involved, so "today" is whatever
 * the caller considers today in the user's own calendar.
 */

/** How far ahead the window looks for its first day with matches, today included. */
export const SCHEDULE_LOOKAHEAD_DAYS = 7
/** Days in a row without matches that close the window. */
export const SCHEDULE_MAX_GAP_DAYS = 2
/**
 * Hard stop for the walk forward, so a corrupt date (a match planned for the
 * year 3000) cannot turn the loop into a long one. Far beyond any real block of
 * play — the longest tournaments run for weeks, not years.
 */
const MAX_WINDOW_DAYS = 366
const DAY_MS = 24 * 60 * 60 * 1000
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

/** Midnight UTC of a 'YYYY-MM-DD' date, used only to step one day at a time. */
function toEpoch(date: string): number {
  const [year, month, day] = date.split('-').map(Number)

  return Date.UTC(year, month - 1, day)
}

function toDate(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 10)
}

export interface ScheduleWindowOptions {
  lookaheadDays?: number
  maxGapDays?: number
}

/**
 * The days the schedule should show, in order, given every date that has a
 * match planned and the date to read "today" as. Empty when there is nothing to
 * publish within the week ahead.
 */
export function resolveScheduleDays(
  plannedDates: Iterable<string>,
  today: string,
  { lookaheadDays = SCHEDULE_LOOKAHEAD_DAYS, maxGapDays = SCHEDULE_MAX_GAP_DAYS }: ScheduleWindowOptions = {}
): string[] {
  const planned = new Set([...plannedDates].filter((date) => DATE_REGEX.test(date)))

  if (planned.size === 0 || !DATE_REGEX.test(today)) {
    return []
  }

  const todayEpoch = toEpoch(today)
  let startEpoch: number | null = null

  for (let offset = 0; offset < lookaheadDays; offset++) {
    const epoch = todayEpoch + offset * DAY_MS

    if (planned.has(toDate(epoch))) {
      startEpoch = epoch
      break
    }
  }

  if (startEpoch === null) {
    return []
  }

  const days: string[] = []
  let gap = 0

  for (let offset = 0; offset < MAX_WINDOW_DAYS && gap < maxGapDays; offset++) {
    const date = toDate(startEpoch + offset * DAY_MS)

    if (planned.has(date)) {
      days.push(date)
      gap = 0
    } else {
      gap++
    }
  }

  return days
}

/** Today as a 'YYYY-MM-DD' string in the reader's own calendar. */
export function todayDate(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}
