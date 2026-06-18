import { AmericanoSettings } from '@/app/(protected)/(tournaments)/models/AmericanoSettings'
import { GroupsPlayoffSettings } from '@/app/(protected)/(tournaments)/models/GroupsPlayoffSettings'
import { LeagueSettings } from '@/app/(protected)/(tournaments)/models/LeagueSettings'
import { PlayoffSettings } from '@/app/(protected)/(tournaments)/models/PlayoffSettings'

/** Settings payload stored in the tournaments table (shape depends on the tournament type). */
export type TournamentSettings = Partial<LeagueSettings & AmericanoSettings & PlayoffSettings & GroupsPlayoffSettings>
