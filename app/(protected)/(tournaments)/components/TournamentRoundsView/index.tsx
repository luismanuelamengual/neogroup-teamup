'use client'

import './index.scss'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import { useMemo } from 'react'
import BracketView from '@/app/(protected)/(tournaments)/components/BracketView'
import FixtureView from '@/app/(protected)/(tournaments)/components/FixtureView'
import GroupsView from '@/app/(protected)/(tournaments)/components/GroupsView'
import StandingsTable from '@/app/(protected)/(tournaments)/components/StandingsTable'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { countsForStandings } from '@/app/(protected)/(tournaments)/utils/matches'
import { hasConsolationBracket } from '@/app/(protected)/(tournaments)/utils/settings'
import MessagePanel from '@/app/components/MessagePanel'

interface TournamentRoundsViewProps {
  tournament: TournamentDto
  category?: number
  organizerMode?: boolean
  onEditMatch?: (match: MatchDto) => void
  /**
   * Organizer ending this category's group phase ahead of time (groups+playoff
   * only). Omitted where the action does not apply, which also hides the button.
   */
  onCloseGroupPhase?: () => void
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
  onEditMatch,
  onCloseGroupPhase
}: TournamentRoundsViewProps) {
  const { hasConsolation, hasKnockout, hasZones, pendingGroupMatches, resolvedGroupMatches } = useMemo(() => {
    const matches = (tournament.matches ?? []).filter((m) => category == null || m.tournamentCategoryId === category)
    const groupMatches = matches.filter((m) => m.type === MatchType.LEAGUE && m.groupNumber != null)

    return {
      hasConsolation: matches.some((m) => m.type === MatchType.CONSOLATION_BRACKET),
      hasKnockout: matches.some((m) => m.type === MatchType.BRACKET),
      hasZones: groupMatches.length > 0,
      pendingGroupMatches: groupMatches.filter((m) => m.status === MatchStatus.PENDING).length,
      resolvedGroupMatches: groupMatches.filter((m) => countsForStandings(m)).length
    }
  }, [tournament.matches, category])
  // Closing the group phase by hand only makes sense while there IS one to
  // close: a running groups+playoff category whose bracket has not been seeded.
  // It also needs something to seed that bracket from, which is the same rule
  // the server enforces (see `closeCategoryGroupPhase`), so the button is only
  // offered once at least one group result is in.
  const canCloseGroupPhase =
    organizerMode &&
    onCloseGroupPhase != null &&
    tournament.type === TournamentType.GROUPS_PLAYOFF &&
    tournament.status === TournamentStatus.ONGOING &&
    hasZones &&
    !hasKnockout &&
    pendingGroupMatches > 0 &&
    resolvedGroupMatches > 0

  // Interclubes takes one of two shapes depending on how many teams entered:
  // a single home-and-away league (no zones) or zones feeding a knockout. Which
  // one it is can be read straight off the matches that were generated.
  if (tournament.type === TournamentType.INTERCLUBS) {
    return (
      <div className="rounds-view">
        {hasZones ? (
          <div className="rounds-section">
            <SectionTitle>Fase de zonas</SectionTitle>
            <GroupsView
              tournament={tournament}
              category={category}
              groupLabel="Zona"
              organizerMode={organizerMode}
              onEditMatch={onEditMatch}
            />
          </div>
        ) : (
          <>
            <div className="rounds-section">
              <SectionTitle>Posiciones</SectionTitle>
              <StandingsTable tournament={tournament} category={category} />
            </div>
            <Divider />
            <div className="rounds-section">
              <SectionTitle>Fixture (ida y vuelta)</SectionTitle>
              <FixtureView
                tournament={tournament}
                category={category}
                organizerMode={organizerMode}
                onEditMatch={onEditMatch}
              />
            </div>
          </>
        )}
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

  if (tournament.type === TournamentType.LEAGUE || tournament.type === TournamentType.AMERICANO) {
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

  if (tournament.type === TournamentType.PLAYOFF) {
    const consolationEnabled = hasConsolationBracket(tournament.type, tournament.settings)

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
        {consolationEnabled && (
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
        <div className="section-header">
          <SectionTitle>Fase de grupos</SectionTitle>
          {canCloseGroupPhase && (
            <Button size="small" variant="outlined" startIcon={<SkipNextIcon />} onClick={onCloseGroupPhase}>
              Finalizar fase de grupos
            </Button>
          )}
        </div>
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
