'use client'

import './index.scss'
import 'dayjs/locale/es'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import dayjs from 'dayjs'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useEffect, useState } from 'react'
import { useHeadToHead } from '@/app/(protected)/(head-to-head)/hooks/useHeadToHead'
import { isSameRoster } from '@/app/(protected)/(head-to-head)/utils/headToHead'
import SuperTiebreakValue from '@/app/(protected)/(tournaments)/components/SuperTiebreakValue'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { getMatchStageName, getOppositeSide } from '@/app/(protected)/(tournaments)/utils/matches'
import { flipScore, formatScore, getScoreColumns } from '@/app/(protected)/(tournaments)/utils/score'
import Avatar from '@/app/components/Avatar'

/** A player of one of the two sides, as the page resolved them from the URL. */
export interface HeadToHeadPlayer {
  id: number
  displayName: string
  shortName: string
  email: string
}

interface HeadToHeadViewProps {
  homePlayerIds: number[]
  awayPlayerIds: number[]
  homePlayers: HeadToHeadPlayer[]
  awayPlayers: HeadToHeadPlayer[]
}

const HOME_ROW = 1
const AWAY_ROW = 2

/**
 * A past encounter, already turned around to face the side the page is about.
 *
 * The stored match keeps whoever played at home that day on the home side, so
 * an encounter where side A was the visitor comes back mirrored — score,
 * winner and all — and the history renders with the same side on top in every
 * row, which is the whole point of the screen.
 */
interface Encounter {
  match: MatchDto
  scoreFormat: ScoreFormat
  winner: MatchSide | null
  columns: ReturnType<typeof getScoreColumns>
  scoreText: string
  tournamentId: number | null
  tournamentName: string
  categoryName: string | null
  siteName: string | null
}

/** Orients one stored match to the page's own sides. */
function toEncounter(match: MatchDto, homePlayerIds: number[]): Encounter {
  const tournament = match.tournamentCategory?.tournament ?? null
  // The two rosters are what tells the sides apart: a competitor id says
  // nothing outside the tournament category it belongs to.
  const reversed = !isSameRoster(match.homeCompetitor?.playerIds ?? [], homePlayerIds)
  const scoreFormat = tournament?.scoreFormat ?? ScoreFormat.BASIC_COUNT
  const score = reversed ? flipScore(match.score) : match.score

  return {
    match,
    scoreFormat,
    winner: reversed ? getOppositeSide(match.winner) : (match.winner ?? null),
    columns: getScoreColumns(score, scoreFormat),
    scoreText: formatScore(score, scoreFormat),
    tournamentId: tournament?.id ?? null,
    tournamentName: tournament?.name ?? 'Torneo',
    categoryName: match.tournamentCategory?.category?.name ?? null,
    // Null means the match was played at the tournament's own venue.
    siteName: match.site?.name ?? tournament?.site?.name ?? null
  }
}

/**
 * One side of the header: who they are and how many of these encounters they
 * won.
 *
 * The number lives INSIDE the side rather than in a shared "2 - 1" scoreline
 * between the two, because that scoreline only reads correctly while the sides
 * sit next to each other. On a phone they stack, and a number floating between
 * two players belongs to neither of them — so it travels with its own player
 * instead, and the same markup just changes direction at the breakpoint.
 */
function SideHeader({
  players,
  fallbackName,
  wins,
  leading
}: {
  players: HeadToHeadPlayer[]
  fallbackName: string
  wins: number
  leading: boolean
}) {
  return (
    <div className={`head-to-head-side ${leading ? 'leading' : ''}`}>
      <div className="identity">
        <div className="avatars">
          {players.length > 0 ? (
            players.map((player) => <Avatar key={player.id} email={player.email} name={player.displayName} size="lg" />)
          ) : (
            <Avatar email="" name={fallbackName} size="lg" />
          )}
        </div>
        <div className="names">
          {(players.length > 0 ? players.map((player) => player.displayName) : [fallbackName]).map((name, index) => (
            <Typography key={index} variant="subtitle1" className="name">
              {name}
            </Typography>
          ))}
        </div>
      </div>
      <span className="wins">{wins}</span>
    </div>
  )
}

/**
 * A single row of the history. The board repeats MatchCard's grid — side A on
 * row 1, side B on row 2, one column per set — because the two screens show the
 * same thing and a second score layout would be one more place to keep in sync.
 */
function HistoryRow({ encounter, homeName, awayName }: { encounter: Encounter; homeName: string; awayName: string }) {
  const { match, columns, winner } = encounter

  return (
    <li className="head-to-head-match">
      <div className="match-header">
        {encounter.tournamentId != null ? (
          <Link href={`/tournaments/${encounter.tournamentId}`} className="tournament">
            {encounter.tournamentName}
          </Link>
        ) : (
          <span className="tournament">{encounter.tournamentName}</span>
        )}
        <div className="tags">
          {encounter.categoryName && <Chip size="small" variant="outlined" label={encounter.categoryName} />}
          <Chip size="small" label={getMatchStageName(match)} />
          {match.status === MatchStatus.WALKOVER && <Chip size="small" color="warning" label="W.O." />}
        </div>
      </div>
      <div className="match-body">
        <div className="meta">
          {match.date && <span className="date">{dayjs(match.date).locale('es').format('D MMM YYYY')}</span>}
          {encounter.siteName && <span className="site">{encounter.siteName}</span>}
          {!match.date && !encounter.siteName && <span className="date">Sin fecha</span>}
        </div>
        <div className="board">
          {/* The names repeat on every row on purpose: they are what tells the
              reader which line of the board won, without counting columns back
              up to the header. They are the short form and truncate, so a long
              doubles pair never pushes the score off the card. */}
          <span
            className={`side-name ${winner === MatchSide.HOME ? 'winner' : ''}`}
            style={{ gridColumn: 1, gridRow: HOME_ROW }}
          >
            <span className="side-dot home" />
            {homeName}
          </span>
          <span
            className={`side-name ${winner === MatchSide.AWAY ? 'winner' : ''}`}
            style={{ gridColumn: 1, gridRow: AWAY_ROW }}
          >
            <span className="side-dot away" />
            {awayName}
          </span>
          {columns ? (
            columns.map((column, index) => (
              <Fragment key={index}>
                <span
                  className={`score-cell ${column.home > column.away ? 'won' : ''}`}
                  style={{ gridColumn: index + 2, gridRow: HOME_ROW }}
                >
                  {column.superTiebreak ? <SuperTiebreakValue value={column.home} /> : column.home}
                </span>
                <span
                  className={`score-cell ${column.away > column.home ? 'won' : ''}`}
                  style={{ gridColumn: index + 2, gridRow: AWAY_ROW }}
                >
                  {column.superTiebreak ? <SuperTiebreakValue value={column.away} /> : column.away}
                </span>
              </Fragment>
            ))
          ) : (
            // A walkover has a winner but no per-side numbers to line up.
            <span className="score-note" style={{ gridColumn: 2, gridRow: `${HOME_ROW} / span 2` }}>
              {encounter.scoreText || '—'}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

/**
 * Head-to-head between two sides: the personal tally on top, every encounter
 * below. Both sides come from the URL as player ids, so the same screen serves
 * singles and doubles/teams, and the history spans every tournament of the
 * organization rather than the one the visitor came from.
 */
export default function HeadToHeadView({
  homePlayerIds,
  awayPlayerIds,
  homePlayers,
  awayPlayers
}: HeadToHeadViewProps) {
  const router = useRouter()
  const { getHeadToHeadMatches } = useHeadToHead()
  const [matches, setMatches] = useState<MatchDto[] | null>(null)
  const [loading, setLoading] = useState(true)
  // The ids are the identity of the screen and arrive as fresh arrays on every
  // render — joining them gives the effect a value it can compare.
  const homeKey = homePlayerIds.join(',')
  const awayKey = awayPlayerIds.join(',')

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    getHeadToHeadMatches(homeKey.split(',').map(Number), awayKey.split(',').map(Number))
      .then((result) => {
        if (!cancelled) {
          setMatches(result)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [getHeadToHeadMatches, homeKey, awayKey])

  const encounters = (matches ?? []).map((match) => toEncounter(match, homePlayerIds))
  const wins = encounters.reduce(
    (tally, encounter) => {
      if (encounter.winner === MatchSide.HOME) {
        tally.home++
      } else if (encounter.winner === MatchSide.AWAY) {
        tally.away++
      }

      return tally
    },
    { home: 0, away: 0 }
  )
  // Short form for the history rows, and the fallback name for a roster whose
  // players no longer resolve (a deleted account).
  const shortName = (players: HeadToHeadPlayer[], ids: number[]): string =>
    players.map((player) => player.shortName).join(' / ') || ids.map((id) => `#${id}`).join(' / ')
  const homeShortName = shortName(homePlayers, homePlayerIds)
  const awayShortName = shortName(awayPlayers, awayPlayerIds)

  return (
    <div className="head-to-head-view">
      <div className="head-to-head-topbar">
        <IconButton size="small" aria-label="Volver" onClick={() => router.back()}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="h6" className="title">
          Head to head
        </Typography>
      </div>

      <div className="head-to-head-header">
        <div className="tally-board">
          <SideHeader
            players={homePlayers}
            fallbackName={homeShortName}
            wins={wins.home}
            leading={wins.home > wins.away}
          />
          {/* Side by side on a wide screen, a full-width rule between the two
              stacked rows on a phone — see index.scss. */}
          <span className="versus">VS</span>
          <SideHeader
            players={awayPlayers}
            fallbackName={awayShortName}
            wins={wins.away}
            leading={wins.away > wins.home}
          />
        </div>
        <Typography variant="caption" className="caption">
          {encounters.length === 1 ? '1 enfrentamiento' : `${encounters.length} enfrentamientos`}
        </Typography>
      </div>

      <div className="head-to-head-history">
        <Typography variant="subtitle2" className="history-title">
          Historial
        </Typography>
        {loading ? (
          <>
            <Skeleton variant="rounded" height={90} />
            <Skeleton variant="rounded" height={90} />
          </>
        ) : encounters.length === 0 ? (
          <Typography variant="body2" color="text.secondary" className="empty">
            Todavía no se enfrentaron en ningún torneo.
          </Typography>
        ) : (
          <ul className="history-list">
            {encounters.map((encounter) => (
              <HistoryRow
                key={encounter.match.id}
                encounter={encounter}
                homeName={homeShortName}
                awayName={awayShortName}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
