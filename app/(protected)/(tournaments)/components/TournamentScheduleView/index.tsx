'use client'

import 'dayjs/locale/es'
import './index.scss'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import Alert from '@mui/material/Alert'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import dayjs from 'dayjs'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { courtLabelOf } from '@/app/(protected)/(sites)/models/SiteData'
import { SiteDto } from '@/app/(protected)/(sites)/models/SiteDto'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import {
  buildPlannerEntries,
  labelToMin,
  minToLabel,
  PlannerEntry
} from '@/app/(protected)/(tournaments)/utils/planner'
import { resolveScheduleDays, todayDate } from '@/app/(protected)/(tournaments)/utils/schedule'
import { useUserStore } from '@/app/stores/users'

/**
 * The schedule as a player reads it: what the organizer planned, published.
 *
 * It is deliberately the printed sheet rather than a second planner. Everything
 * a player does here is look — for their own match, or for what is on the court
 * next — so the screen reproduces the PDF the organizer exports and clubs pin to
 * the wall: the same teal/amber bands, the same court x hour grid (or, for
 * interclubes, the same four-column programme), read top to bottom by day. The
 * palette is the one in app/utils/pdf.ts, mirrored in index.scss.
 *
 * **One sheet per venue.** The split is the top-level structure, not something
 * that happens inside a day, because a venue is where a player physically goes:
 * somebody playing at one club has no use for the other club's courts, and
 * "Cancha 1" only means something once you know whose. So each venue gets its
 * own headed sheet with its own days, its own court columns and its own court
 * names — the same shape the organizer would get by exporting that venue alone.
 *
 * Two things it does that paper cannot: the player's own matches are lit up, and
 * the days shown are derived rather than chosen (see utils/schedule.ts). The
 * window is derived once for the whole tournament, not per venue, so every sheet
 * covers the same block of play and a venue idle during it simply has no sheet.
 */

interface TournamentScheduleViewProps {
  tournamentId: number
}

/** One planned match, resolved into everything a cell of the sheet prints. */
interface ScheduledMatch {
  entry: PlannerEntry
  /** Start time in minutes from midnight. */
  startMin: number
  /** 1-based court — the interclubes planner stores its slot here. */
  court: number
  /** True when the signed-in player (or their team) plays it. */
  mine: boolean
}

/** A day of one venue's sheet. */
interface ScheduleDay {
  date: string
  heading: string
  matches: ScheduledMatch[]
}

/** Everything one venue's sheet prints. */
interface VenueSheet {
  key: string
  /**
   * The venue itself, for its name and its courts setup. Null only for a match
   * planned before venues were required, which no longer happens.
   */
  site: SiteDto | null
  /**
   * Court columns, taken over the whole window rather than day by day, so a
   * court that only runs on the Sunday still holds its column on the Saturday
   * and the sheet reads as one table.
   */
  courts: number[]
  days: ScheduleDay[]
}

export default function TournamentScheduleView({ tournamentId }: TournamentScheduleViewProps) {
  const { getTournament } = useTournaments()
  const [tournament, setTournament] = useState<TournamentDto | null>(null)
  const [loading, setLoading] = useState(true)
  const userId = useUserStore((state) => state.user?.id ?? null)

  useEffect(() => {
    getTournament(tournamentId)
      .then(setTournament)
      .finally(() => setLoading(false))
  }, [getTournament, tournamentId])

  const isInterclubs = tournament?.type === TournamentType.INTERCLUBS
  // Interclubes is the one format whose round-robin matches are worth labelling
  // ("Zona 2 - Fecha 3"): its programme is read as a fixture list, where every
  // row needs to say which one it belongs to.
  const entries = useMemo(
    () => buildPlannerEntries(tournament, { zoneLabels: isInterclubs }),
    [tournament, isInterclubs]
  )
  /** The competitor the signed-in user plays as, if they are in this tournament. */
  const myCompetitorId = useMemo(() => {
    if (userId == null) {
      return null
    }

    return (tournament?.competitors ?? []).find((competitor) => competitor.playerIds.includes(userId))?.id ?? null
  }, [tournament, userId])
  /** One sheet per venue in play, each with its own days. */
  const sheets = useMemo<VenueSheet[]>(() => {
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]))
    const planned = (tournament?.matches ?? []).filter(
      (match) => match.date != null && match.hour != null && entriesById.has(match.id)
    )
    // The window is the tournament's, not each venue's: every sheet covers the
    // same block of play, so two venues can be compared day against day.
    const dates = resolveScheduleDays(
      planned.map((match) => match.date!),
      todayDate()
    )
    const window = new Set(dates)
    const byVenue = new Map<
      string,
      { site: SiteDto | null; courts: Set<number>; days: Map<string, ScheduledMatch[]> }
    >()

    for (const match of planned) {
      const startMin = labelToMin(match.hour!)

      if (!window.has(match.date!) || startMin == null) {
        continue
      }

      // Which venue a match belongs to is decided by its `siteId`, never by the
      // relation that resolves it: filing a match under the tournament's own
      // club because its `site` happened not to load is exactly the mix-up this
      // split exists to prevent — two clubs' "Cancha 1" on one sheet. A match
      // with no venue of its own is played at the tournament's.
      const ownVenue = match.siteId != null
      const siteId = ownVenue ? match.siteId : (tournament?.siteId ?? null)
      const site = (ownVenue ? match.site : tournament?.site) ?? null
      const key = String(siteId ?? 'none')
      const venue = byVenue.get(key) ?? { site, courts: new Set<number>(), days: new Map<string, ScheduledMatch[]>() }
      // A match planned before courts were a thing would have none; treating it
      // as court 1 keeps it on the sheet instead of dropping it.
      const court = match.courtNumber ?? 1

      venue.courts.add(court)
      venue.days.set(match.date!, [
        ...(venue.days.get(match.date!) ?? []),
        {
          entry: entriesById.get(match.id)!,
          startMin,
          court,
          mine:
            myCompetitorId != null &&
            (match.homeCompetitorId === myCompetitorId || match.awayCompetitorId === myCompetitorId)
        }
      ])
      byVenue.set(key, venue)
    }

    return [...byVenue.entries()]
      .map(([key, venue]) => ({
        key,
        site: venue.site,
        courts: [...venue.courts].sort((a, b) => a - b),
        // Only the days this venue actually plays — an idle Sunday belongs to
        // the other club's sheet, not to a blank table on this one.
        days: dates
          .filter((date) => venue.days.has(date))
          .map((date) => ({
            date,
            heading: dayjs(date).locale('es').format('dddd D [de] MMMM'),
            matches: venue.days.get(date)!
          }))
      }))
      .sort((a, b) => (a.site?.name ?? '').localeCompare(b.site?.name ?? ''))
  }, [entries, tournament, myCompetitorId])

  if (loading) {
    return (
      <div className="tournament-schedule">
        <div className="schedule-topbar">
          <Skeleton variant="circular" width={34} height={34} />
          <Skeleton variant="text" height={40} className="schedule-title" />
        </div>
        <Skeleton variant="rounded" height={72} />
        <Skeleton variant="rounded" height={420} />
      </div>
    )
  }

  if (!tournament) {
    return <Alert severity="error">Torneo no encontrado</Alert>
  }

  /**
   * The teal band every sheet opens with. Unlike the exported PDF it carries
   * neither logo nor tournament name: the app's own top bar and the page title
   * are already showing both right above. What is left is what tells one sheet
   * from the next — the venue.
   */
  const header = (venue: string | null) => (
    <div className="sheet-header">
      <div className="sheet-header-text">
        <span className="sheet-venue">{venue ? `Sede: ${venue}` : 'Programación de partidos'}</span>
        {venue && <span className="sheet-subtitle">Programación de partidos</span>}
      </div>
    </div>
  )

  return (
    <div className="tournament-schedule">
      <div className="schedule-topbar">
        <Link href={`/tournaments/${tournamentId}`} className="back-link">
          <IconButton size="small">
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        </Link>
        <div className="schedule-topbar-titles">
          <Typography variant="h5" component="h1" className="schedule-title">
            Programación
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {tournament.name}
          </Typography>
        </div>
      </div>

      {sheets.length === 0 ? (
        <Paper className="schedule-sheet" elevation={2}>
          {header(null)}
          <div className="sheet-empty">
            <Typography variant="body2">
              Todavía no hay partidos programados para los próximos días. Cuando el organizador publique la programación
              vas a verla acá.
            </Typography>
          </div>
        </Paper>
      ) : (
        sheets.map((sheet) => (
          <Paper key={sheet.key} className="schedule-sheet" elevation={2}>
            {header(sheet.site?.name ?? null)}
            <div className="sheet-body">
              {sheet.days.map((day) => (
                <section key={day.date} className="sheet-day">
                  <h2 className="day-heading">{day.heading}</h2>
                  {isInterclubs ? (
                    <SeriesTable site={sheet.site} matches={day.matches} />
                  ) : (
                    <CourtsGrid site={sheet.site} matches={day.matches} courts={sheet.courts} />
                  )}
                </section>
              ))}
            </div>
          </Paper>
        ))
      )}
    </div>
  )
}

/* --------------------------------------------------------------------------
 * The two sheet formats
 * ------------------------------------------------------------------------ */

/**
 * Qualifier printed above a start time when some match of that day is scheduled
 * to end exactly as it begins: a court that may still be in use cannot promise
 * an hour, so the row announces the earliest a match can start. Same rule (and
 * wording) as the exported PDF.
 */
const TIME_APPROX_LABEL = 'No antes de'

function isApproximate(site: SiteDto | null, starts: Set<number>, startMin: number, isFirst: boolean): boolean {
  const duration = site?.data?.matchDuration

  return !isFirst && duration != null && starts.has(startMin - duration)
}

/** Everything a match cell prints, in both formats. */
function MatchSides({ entry }: { entry: PlannerEntry }) {
  return (
    <div className="cell-sides">
      <span className={`side ${entry.homePlaceholder ? 'placeholder' : ''}`}>{entry.home}</span>
      <span className="vs">vs</span>
      <span className={`side ${entry.awayPlaceholder ? 'placeholder' : ''}`}>{entry.away}</span>
    </div>
  )
}

/** The regular sheet: courts as columns, start times as rows. */
function CourtsGrid({ site, matches, courts }: { site: SiteDto | null; matches: ScheduledMatch[]; courts: number[] }) {
  const starts = new Set(matches.map((match) => match.startMin))
  const startMins = [...starts].sort((a, b) => a - b)

  return (
    <div className="grid-scroller">
      <table className="courts-grid">
        <thead>
          <tr>
            <th className="time-header">Hora</th>
            {courts.map((court) => (
              <th key={court} className="court-header">
                {courtLabelOf(site?.data, court)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {startMins.map((startMin, index) => (
            <tr key={startMin} className={index % 2 === 0 ? '' : 'alt'}>
              <th className="time-cell">
                {isApproximate(site, starts, startMin, index === 0) && (
                  <span className="time-approx">{TIME_APPROX_LABEL}</span>
                )}
                <span className="time-value">{minToLabel(startMin)}</span>
              </th>
              {courts.map((court) => {
                const match = matches.find((candidate) => candidate.startMin === startMin && candidate.court === court)

                if (!match) {
                  return (
                    <td key={court} className="empty-cell">
                      —
                    </td>
                  )
                }

                return (
                  <td key={court} className={`match-cell ${match.mine ? 'mine' : ''}`}>
                    <div className="cell-strip">
                      <span className="cell-category">{match.entry.category}</span>
                      {(match.entry.round || match.entry.consolation) && (
                        <span className="cell-meta">
                          {match.entry.round && <span className="cell-round">{match.entry.round}</span>}
                          {match.entry.consolation && <span className="consolation-chip">Consuelo</span>}
                        </span>
                      )}
                    </div>
                    <div className="cell-body">
                      <MatchSides entry={match.entry} />
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The interclubes sheet: a timetable rather than a grid. A day there is a list
 * of series, and the programmes clubs already read are a four-column table —
 * hour, category, the series itself and the round it belongs to.
 */
function SeriesTable({ site, matches }: { site: SiteDto | null; matches: ScheduledMatch[] }) {
  // By hour, and inside an hour in the order the planner's slots are shown.
  const series = [...matches].sort((a, b) => a.startMin - b.startMin || a.court - b.court)
  const starts = new Set(matches.map((match) => match.startMin))
  const firstStart = series[0]?.startMin

  return (
    <div className="grid-scroller">
      <table className="series-table">
        <thead>
          <tr>
            <th className="time-header">Hora</th>
            <th>Categoría</th>
            <th>Serie</th>
            <th>Ronda</th>
          </tr>
        </thead>
        <tbody>
          {series.map((match, index) => (
            <tr key={match.entry.id} className={`${index % 2 === 0 ? '' : 'alt'} ${match.mine ? 'mine' : ''}`}>
              <th className="time-cell">
                {isApproximate(site, starts, match.startMin, match.startMin === firstStart) && (
                  <span className="time-approx">{TIME_APPROX_LABEL}</span>
                )}
                <span className="time-value">{minToLabel(match.startMin)}</span>
              </th>
              <td className="category-cell">{match.entry.category}</td>
              <td className="series-cell">
                <MatchSides entry={match.entry} />
              </td>
              <td className="round-cell">
                {match.entry.round && <span className="cell-round">{match.entry.round}</span>}
                {match.entry.consolation && <span className="consolation-chip">Consuelo</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
