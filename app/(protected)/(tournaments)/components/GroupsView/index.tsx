'use client'

import './index.scss'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import { useEffect, useMemo, useState } from 'react'
import FixtureView from '@/app/(protected)/(tournaments)/components/FixtureView'
import StandingsTable from '@/app/(protected)/(tournaments)/components/StandingsTable'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { RoundType } from '@/app/(protected)/(tournaments)/models/RoundType'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'

interface GroupsViewProps {
  tournament: TournamentDto
  category?: number
  organizerMode?: boolean
  onEditMatch?: (match: MatchDto) => void
}

/** Round-robin group phase of a "groups + playoff" tournament, one tab per group. */
export default function GroupsView({ tournament, category, organizerMode = false, onEditMatch }: GroupsViewProps) {
  const groups = useMemo(() => {
    const numbers = new Set<number>()

    for (const round of tournament.rounds ?? []) {
      if (
        (category == null || round.tournamentCategoryId === category) &&
        round.type === RoundType.LEAGUE &&
        round.groupNumber != null
      ) {
        numbers.add(round.groupNumber)
      }
    }

    return [...numbers].sort((a, b) => a - b)
  }, [tournament.rounds, category])
  const [active, setActive] = useState(0)

  // Keep the active tab valid if the number of groups changes.
  useEffect(() => {
    if (active > groups.length - 1) {
      setActive(0)
    }
  }, [groups.length, active])

  if (groups.length === 0) {
    return null
  }

  const activeGroup = groups[Math.min(active, groups.length - 1)]

  return (
    <div className="groups-view">
      <Tabs
        value={Math.min(active, groups.length - 1)}
        onChange={(_event, value) => setActive(value)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        className="groups-tabs"
      >
        {groups.map((groupNumber, index) => (
          <Tab key={groupNumber} label={`Grupo ${index + 1}`} />
        ))}
      </Tabs>
      <div className="group-panel">
        <StandingsTable tournament={tournament} category={category} groupNumber={activeGroup} />
        <FixtureView
          tournament={tournament}
          category={category}
          groupNumber={activeGroup}
          organizerMode={organizerMode}
          onEditMatch={onEditMatch}
        />
      </div>
    </div>
  )
}
