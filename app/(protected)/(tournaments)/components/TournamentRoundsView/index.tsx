'use client'

import './index.scss'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import BracketView from '@/app/(protected)/(tournaments)/components/BracketView'
import FixtureView from '@/app/(protected)/(tournaments)/components/FixtureView'
import GroupsView from '@/app/(protected)/(tournaments)/components/GroupsView'
import StandingsTable from '@/app/(protected)/(tournaments)/components/StandingsTable'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { RoundType } from '@/app/(protected)/(tournaments)/models/RoundType'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'

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

/**
 * Renders the rounds area of one category: fixtures/standings for leagues and
 * americano, the bracket (plus an optional consolation bracket) for playoffs,
 * and the groups phase plus the knockout bracket for groups+playoff.
 */
export default function TournamentRoundsView({
  tournament,
  category,
  organizerMode = false,
  onEditMatch
}: TournamentRoundsViewProps) {
  const t = useTranslations('tournaments')
  const { hasConsolation, hasKnockout } = useMemo(() => {
    const rounds = (tournament.rounds ?? []).filter((r) => category == null || (r.categoryId ?? null) === category)

    return {
      hasConsolation: rounds.some((r) => r.type === RoundType.KNOCKOUT_CONSOLATION),
      hasKnockout: rounds.some((r) => r.type === RoundType.KNOCKOUT)
    }
  }, [tournament.rounds, category])

  if (
    tournament.type === TournamentType.LEAGUE ||
    tournament.type === TournamentType.AMERICANO ||
    tournament.type === TournamentType.AMERICANO_WITH_SWAP
  ) {
    return (
      <div className="rounds-view">
        <div className="rounds-section">
          <SectionTitle>{t('fixture')}</SectionTitle>
          <FixtureView
            tournament={tournament}
            category={category}
            organizerMode={organizerMode}
            onEditMatch={onEditMatch}
          />
        </div>
        <div className="rounds-section">
          <SectionTitle>{t('standings')}</SectionTitle>
          <StandingsTable tournament={tournament} category={category} />
        </div>
      </div>
    )
  }

  if (tournament.type === TournamentType.PLAYOFF || tournament.type === TournamentType.PLAYOFF_WITH_CONSOLATION) {
    return (
      <div className="rounds-view">
        <div className="rounds-section">
          <SectionTitle>{hasConsolation ? t('mainBracket') : t('bracket')}</SectionTitle>
          <BracketView
            tournament={tournament}
            category={category}
            organizerMode={organizerMode}
            onEditMatch={onEditMatch}
          />
        </div>
        {hasConsolation && (
          <div className="rounds-section">
            <SectionTitle>{t('consolationBracketTitle')}</SectionTitle>
            <BracketView
              tournament={tournament}
              category={category}
              roundType={RoundType.KNOCKOUT_CONSOLATION}
              organizerMode={organizerMode}
              onEditMatch={onEditMatch}
            />
          </div>
        )}
      </div>
    )
  }

  // GROUPS_PLAYOFF
  return (
    <div className="rounds-view">
      <div className="rounds-section">
        <SectionTitle>{t('groupPhase')}</SectionTitle>
        <GroupsView
          tournament={tournament}
          category={category}
          organizerMode={organizerMode}
          onEditMatch={onEditMatch}
        />
      </div>
      {hasKnockout && (
        <div className="rounds-section">
          <SectionTitle>{t('knockoutPhase')}</SectionTitle>
          <BracketView
            tournament={tournament}
            category={category}
            roundType={RoundType.KNOCKOUT}
            organizerMode={organizerMode}
            onEditMatch={onEditMatch}
          />
        </div>
      )}
    </div>
  )
}
