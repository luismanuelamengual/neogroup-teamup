'use client'

import './index.scss'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import FixtureView from '@/app/(protected)/(tournaments)/components/FixtureView'
import StandingsTable from '@/app/(protected)/(tournaments)/components/StandingsTable'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'

interface GroupsViewProps {
  tournament: TournamentDto
  category?: string
  organizerMode?: boolean
  onEditMatch?: (match: MatchDto) => void
}

/** Round-robin group phase of a "groups + playoff" tournament, one tab per group. */
export default function GroupsView({ tournament, category, organizerMode = false, onEditMatch }: GroupsViewProps) {
  const t = useTranslations('tournaments')
  const groups = useMemo(() => {
    const brackets = new Set<string>()

    for (const round of tournament.rounds ?? []) {
      if ((category == null || (round.category ?? null) === category) && (round.bracket ?? '').startsWith('group:')) {
        brackets.add(round.bracket as string)
      }
    }

    return [...brackets].sort((a, b) => Number(a.split(':')[1]) - Number(b.split(':')[1]))
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

  const activeBracket = groups[Math.min(active, groups.length - 1)]

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
        {groups.map((bracket, index) => (
          <Tab key={bracket} label={t('group', { number: index + 1 })} />
        ))}
      </Tabs>
      <div className="group-panel">
        <StandingsTable tournament={tournament} category={category} bracket={activeBracket} />
        <FixtureView
          tournament={tournament}
          category={category}
          bracket={activeBracket}
          organizerMode={organizerMode}
          onEditMatch={onEditMatch}
        />
      </div>
    </div>
  )
}
