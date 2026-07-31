/** A started tournament whose service fee has not been settled yet, with what it owes. */
export interface PendingTournamentDto {
  id: number
  name: string
  /** "YYYY-MM-DD" start date of the tournament. */
  startDate: string
  /** Entry fee each competitor paid the organizer. */
  entryFee: number
  /** Registered competitors (a doubles pair counts once) — what the fee is charged on. */
  competitorsCount: number
  /** `competitorsCount × entryFee`: what the tournament collected. */
  grossAmount: number
  /** TeamUp's cut of `grossAmount`. */
  amount: number
  /** Whether it started more than a month ago and is therefore overdue. */
  overdue: boolean
}

/** Everything the organization owes TeamUp right now. */
export interface PendingPaymentsDto {
  tournaments: PendingTournamentDto[]
  /** Service fee percentage applied (e.g. 4 = 4%). */
  serviceFeePercentage: number
  currency: string
  competitorsCount: number
  grossAmount: number
  /** Total to pay: the sum of every tournament's `amount`. */
  amount: number
  /** How many of `tournaments` are overdue (older than a month). */
  overdueCount: number
}
