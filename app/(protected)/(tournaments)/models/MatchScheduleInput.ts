/**
 * Where and when a match is played, as submitted by the organizer's planner.
 *
 * Every field is required: the planner always places a match at a venue, on a
 * day, at a time and on a court. Removing a match from the planning is a
 * different operation (clearMatchSchedule), not a partially-empty schedule.
 */
export interface MatchScheduleInput {
  /** Venue of the match. */
  siteId: number
  /** Calendar day, 'YYYY-MM-DD'. */
  date: string
  /** Start time, 'HH:mm'. */
  hour: string
  /** 1-based court inside the venue. */
  courtNumber: number
}
