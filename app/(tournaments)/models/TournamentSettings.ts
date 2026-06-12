import { AmericanoSettings } from '@/app/(tournaments)/models/AmericanoSettings'
import { LeagueSettings } from '@/app/(tournaments)/models/LeagueSettings'

/** Settings payload stored in the tournaments table (shape depends on the tournament type). */
export type TournamentSettings = Partial<LeagueSettings & AmericanoSettings>
