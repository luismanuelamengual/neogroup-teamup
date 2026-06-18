'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import BracketView from '@/app/(protected)/(tournaments)/components/BracketView'
import FixtureView from '@/app/(protected)/(tournaments)/components/FixtureView'
import GroupsView from '@/app/(protected)/(tournaments)/components/GroupsView'
import StandingsTable from '@/app/(protected)/(tournaments)/components/StandingsTable'
import { BRACKET_CONSOLATION, BRACKET_PLAYOFF } from '@/app/(protected)/(tournaments)/models/Bracket'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'

interface TournamentRoundsViewProps {
  tournament: TournamentDto
  category?: string
  organizerMode?: boolean
  onEditMatch?: (match: MatchDto) => void
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="subtitle1" fontWeight={700} fontSize={15}>
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
    const rounds = (tournament.rounds ?? []).filter((r) => category == null || (r.category ?? null) === category)

    return {
      hasConsolation: rounds.some((r) => r.bracket === BRACKET_CONSOLATION),
      hasKnockout: rounds.some((r) => r.bracket === BRACKET_PLAYOFF)
    }
  }, [tournament.rounds, category])

  if (tournament.type === TournamentType.LEAGUE || tournament.type === TournamentType.AMERICANO) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SectionTitle>{t('fixture')}</SectionTitle>
          <FixtureView
            tournament={tournament}
            category={category}
            organizerMode={organizerMode}
            onEditMatch={onEditMatch}
          />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SectionTitle>{t('standings')}</SectionTitle>
          <StandingsTable tournament={tournament} category={category} />
        </Box>
      </Box>
    )
  }

  if (tournament.type === TournamentType.PLAYOFF) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SectionTitle>{hasConsolation ? t('mainBracket') : t('bracket')}</SectionTitle>
          <BracketView
            tournament={tournament}
            category={category}
            organizerMode={organizerMode}
            onEditMatch={onEditMatch}
          />
        </Box>
        {hasConsolation && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <SectionTitle>{t('consolationBracketTitle')}</SectionTitle>
            <BracketView
              tournament={tournament}
              category={category}
              bracket={BRACKET_CONSOLATION}
              organizerMode={organizerMode}
              onEditMatch={onEditMatch}
            />
          </Box>
        )}
      </Box>
    )
  }

  // GROUPS_PLAYOFF
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <SectionTitle>{t('groupPhase')}</SectionTitle>
        <GroupsView
          tournament={tournament}
          category={category}
          organizerMode={organizerMode}
          onEditMatch={onEditMatch}
        />
      </Box>
      {hasKnockout && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SectionTitle>{t('knockoutPhase')}</SectionTitle>
          <BracketView
            tournament={tournament}
            category={category}
            bracket={BRACKET_PLAYOFF}
            organizerMode={organizerMode}
            onEditMatch={onEditMatch}
          />
        </Box>
      )}
    </Box>
  )
}
