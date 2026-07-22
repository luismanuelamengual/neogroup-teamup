'use client'

import './index.scss'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import { useMemo } from 'react'
import BracketView from '@/app/(protected)/(tournaments)/components/BracketView'
import FixtureView from '@/app/(protected)/(tournaments)/components/FixtureView'
import GroupsView from '@/app/(protected)/(tournaments)/components/GroupsView'
import StandingsTable from '@/app/(protected)/(tournaments)/components/StandingsTable'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import MessagePanel from '@/app/components/MessagePanel'

interface TournamentRoundsViewProps {
  tournament: TournamentDto
  category?: number
  organizerMode?: boolean
  onEditMatch?: (match: MatchDto) => void
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="subtitle1" className="section-title">
      {children}
    </Typography>
  )
}

export default function TournamentRoundsView({
  tournament,
  category,
  organizerMode = false,
  onEditMatch
}: TournamentRoundsViewProps) {
  const { hasConsolation, hasKnockout } = useMemo(() => {
    const matches = (tournament.matches ?? []).filter((m) => category == null || m.tournamentCategoryId === category)

    return {
      hasConsolation: matches.some((m) => m.type === MatchType.CONSOLATION_BRACKET),
      hasKnockout: matches.some((m) => m.type === MatchType.BRACKET)
    }
  }, [tournament.matches, category])

  if (
    tournament.type === TournamentType.LEAGUE ||
    tournament.type === TournamentType.AMERICANO ||
    tournament.type === TournamentType.AMERICANO_WITH_SWAP
  ) {
    return (
      <div className="rounds-view">
        <div className="rounds-section">
          <SectionTitle>Posiciones</SectionTitle>
          <StandingsTable tournament={tournament} category={category} />
        </div>
        <Divider />
        <div className="rounds-section">
          <SectionTitle>Fixture</SectionTitle>
          <FixtureView
            tournament={tournament}
            category={category}
            organizerMode={organizerMode}
            onEditMatch={onEditMatch}
          />
        </div>
      </div>
    )
  }

  if (tournament.type === TournamentType.PLAYOFF || tournament.type === TournamentType.PLAYOFF_WITH_CONSOLATION) {
    return (
      <div className="rounds-view">
        <div className="rounds-section">
          <SectionTitle>{'Cuadro principal'}</SectionTitle>
          <BracketView
            tournament={tournament}
            category={category}
            organizerMode={organizerMode}
            onEditMatch={onEditMatch}
          />
        </div>
        {tournament.type == TournamentType.PLAYOFF_WITH_CONSOLATION && (
          <>
            <Divider />
            <div className="rounds-section">
              <SectionTitle>Cuadro consuelo</SectionTitle>
              {!hasConsolation && (
                <MessagePanel>
                  Cuadro consuelo se configurará una vez que haya terminado la 1era ronda del cuadro principal
                </MessagePanel>
              )}
              {hasConsolation && (
                <BracketView
                  tournament={tournament}
                  category={category}
                  bracketType={MatchType.CONSOLATION_BRACKET}
                  organizerMode={organizerMode}
                  onEditMatch={onEditMatch}
                />
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  // GROUPS_PLAYOFF
  return (
    <div className="rounds-view">
      <div className="rounds-section">
        <SectionTitle>Fase de grupos</SectionTitle>
        <GroupsView
          tournament={tournament}
          category={category}
          organizerMode={organizerMode}
          onEditMatch={onEditMatch}
        />
      </div>
      {hasKnockout && (
        <>
          <Divider />
          <div className="rounds-section">
            <SectionTitle>Fase eliminatoria</SectionTitle>
            <BracketView
              tournament={tournament}
              category={category}
              bracketType={MatchType.BRACKET}
              organizerMode={organizerMode}
              onEditMatch={onEditMatch}
            />
          </div>
        </>
      )}
    </div>
  )
}
