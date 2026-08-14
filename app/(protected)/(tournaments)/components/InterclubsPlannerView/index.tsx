'use client'

import 'dayjs/locale/es'
import '../TournamentPlannerView/index.scss'
import './index.scss'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CloseIcon from '@mui/icons-material/Close'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import SearchIcon from '@mui/icons-material/Search'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import dayjs, { Dayjs } from 'dayjs'
import Link from 'next/link'
import { DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SiteSelector from '@/app/(protected)/(sites)/components/SiteSelector'
import { useSites } from '@/app/(protected)/(sites)/hooks/useSites'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { MatchSide, MatchSideNames } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import {
  buildPlannerEntries,
  DAY_START_MIN,
  DURATION_OPTIONS,
  labelToMin,
  MAX_PLANNING_DAYS,
  minToLabel,
  Placement,
  PlannerEntry,
  ROW_HEIGHT,
  SLOT_MIN,
  SLOTS
} from '@/app/(protected)/(tournaments)/utils/planner'
import { useNotifications } from '@/app/hooks/useNotifications'
import { searchTerms } from '@/app/utils/text'
import { downloadInterclubsPdf, InterclubsPdfDay } from './exportPdf'

/**
 * Interclubes planner.
 *
 * It is the regular planner with the courts replaced by slots. A series is
 * played at the club of its home team — the fixture already decided that, see
 * the localía rotation in utils/interclubs — so there is no court to pick and
 * nothing to name: what the grid lays side by side is simply how many series
 * the organizer wants running at the same hour. Four series at 10:00 are an
 * ordinary Sunday here (they are at four different clubs), so the day is given
 * as many slots as it needs and each column holds one of them.
 *
 * The exception is a day gathered at one club, typically the finals. Picking a
 * venue at the top sends every series dropped from then on to that club,
 * whoever the home team is, and the exported programme names it under the date.
 * Left empty — the ordinary case — nothing is printed about the venue, because
 * "cada uno en su sede" is what everybody already assumes.
 *
 * Everything else — the pool of pending series, the drag & drop, the day range,
 * the branded PDF — works exactly like the regular planner.
 */

/**
 * Series duration, in minutes. An interclubes encounter is three matches, so it
 * runs longer than the hour and a half a single match does. Stored as a habit
 * of the organizer, like in the regular planner.
 */
const DURATION_STORAGE_KEY = 'interclubsPlanner:duration'
const DEFAULT_SERIES_DURATION = 120
/**
 * The venue chosen for this tournament, if any. It is not a property of the
 * tournament (each series stores its own), but re-picking "the finals are at
 * the Andino" on every visit would be busywork, so the choice is remembered per
 * tournament in the organizer's own browser.
 */
const siteStorageKey = (tournamentId: number) => `interclubsPlanner:site:${tournamentId}`
/**
 * Slots are the columns of the grid: not courts (each series is at a club of
 * its own, which fields as many courts as it needs) but places in the hour, so
 * the organizer can see at a glance that four series start at 10:00. The slot
 * a series is dropped in is what gets stored as its court number.
 */
const DEFAULT_SLOTS = 3
const MAX_SLOTS = 12
/** How many slots this tournament is planned with, remembered per tournament. */
const slotsStorageKey = (tournamentId: number) => `interclubsPlanner:slots:${tournamentId}`

/** Reads the persisted slot count, falling back to the default. */
function loadSlots(tournamentId: number): number {
  if (typeof window === 'undefined') {
    return DEFAULT_SLOTS
  }

  try {
    const slots = Number(window.localStorage.getItem(slotsStorageKey(tournamentId)))

    return Number.isFinite(slots) && slots >= 1 ? Math.min(MAX_SLOTS, Math.floor(slots)) : DEFAULT_SLOTS
  } catch {
    return DEFAULT_SLOTS
  }
}

/** Reads the persisted series duration, falling back to the default. */
function loadDuration(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_SERIES_DURATION
  }

  try {
    const duration = Number(window.localStorage.getItem(DURATION_STORAGE_KEY))

    return DURATION_OPTIONS.includes(duration) ? duration : DEFAULT_SERIES_DURATION
  } catch {
    return DEFAULT_SERIES_DURATION
  }
}

/** Identifies what is currently being dragged. */
interface DragInfo {
  matchId: number
  /** Vertical offset (px) between the grab point and the top of the series card. */
  grabOffsetY: number
}

/** Where the drop preview is being shown: a day, a slot and a start time. */
interface DragTarget {
  dateIso: string
  /** 1-based slot, i.e. which column of the day. */
  slot: number
  startMin: number
}

interface InterclubsPlannerViewProps {
  tournamentId: number
  /** Organization-resolved logo URL for the exported PDF header (see resolveOrganizationImage). */
  logoSrc?: string
}

export default function InterclubsPlannerView({ tournamentId, logoSrc }: InterclubsPlannerViewProps) {
  const { getTournament, saveMatchSchedule, clearMatchSchedule } = useTournaments()
  const { getAllSites } = useSites()
  const { showWarningMessage } = useNotifications()
  const [tournament, setTournament] = useState<TournamentDto | null>(null)
  const [loading, setLoading] = useState(true)
  // Venue catalogue, kept to name the chosen venue on the exported programme.
  const [siteNames, setSiteNames] = useState<Record<number, string>>({})
  /**
   * Venue every series is sent to, overriding the home team's own club. Null —
   * the ordinary case — leaves each series at its home club.
   */
  const [siteId, setSiteId] = useState<number | null>(null)
  const [slots, setSlots] = useState(DEFAULT_SLOTS)
  const [duration, setDuration] = useState(DEFAULT_SERIES_DURATION)
  const [startDate, setStartDate] = useState<Dayjs>(() => dayjs().startOf('day'))
  const [endDate, setEndDate] = useState<Dayjs>(() => dayjs().startOf('day').add(2, 'day'))
  /**
   * Optimistic overlay on top of what the server says. A drag applies here
   * immediately (so the card moves without waiting for the round-trip) and the
   * entry is dropped again once the tournament is refetched — or rolled back if
   * the request fails. `null` marks a series being unscheduled.
   */
  const [pendingPlacements, setPendingPlacements] = useState<Record<number, Placement | null>>({})
  // Column + slot currently previewed while dragging.
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null)
  // Series currently being dragged — hidden from its original spot while moving.
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const dragRef = useRef<DragInfo | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  // Persistent (already-painted) element reused as the drag image for pool drags.
  const ghostRef = useRef<HTMLDivElement>(null)
  // True until the initial load has seeded the day range, so it is only ever
  // applied once.
  const initializedRef = useRef(false)

  useEffect(() => {
    setDuration(loadDuration())
    setSlots(loadSlots(tournamentId))

    try {
      const stored = Number(window.localStorage.getItem(siteStorageKey(tournamentId)))

      setSiteId(Number.isInteger(stored) && stored > 0 ? stored : null)
    } catch {
      // Ignore read errors (e.g. storage disabled).
    }
  }, [tournamentId])

  useEffect(() => {
    let cancelled = false

    getAllSites()
      .then((sites) => {
        if (!cancelled) {
          setSiteNames(Object.fromEntries(sites.map((site) => [site.id, site.name])))
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [getAllSites])

  const refreshTournament = useCallback(
    () =>
      getTournament(tournamentId).then((data) => {
        setTournament(data)

        return data
      }),
    [getTournament, tournamentId]
  )

  useEffect(() => {
    refreshTournament()
      .then((data) => {
        if (!data || initializedRef.current) {
          return
        }

        initializedRef.current = true

        // Show the days that are already planned rather than always starting at
        // "today", which would hide an existing planning behind a date change.
        const scheduled = (data.matches ?? []).filter((match) => match.date != null).map((match) => match.date!)
        const firstScheduled = [...scheduled].sort()[0]

        if (firstScheduled) {
          const first = dayjs(firstScheduled).startOf('day')
          const last = dayjs([...scheduled].sort().at(-1)!).startOf('day')
          const maxEnd = first.add(MAX_PLANNING_DAYS - 1, 'day')

          setStartDate(first)
          setEndDate(last.isAfter(maxEnd, 'day') ? maxEnd : last)
        }
      })
      .finally(() => setLoading(false))
  }, [refreshTournament])

  useEffect(() => {
    try {
      window.localStorage.setItem(DURATION_STORAGE_KEY, String(duration))
    } catch {
      // Ignore write errors (e.g. storage disabled/full).
    }
  }, [duration])

  useEffect(() => {
    try {
      window.localStorage.setItem(slotsStorageKey(tournamentId), String(slots))
    } catch {
      // Ignore write errors (e.g. storage disabled/full).
    }
  }, [slots, tournamentId])

  useEffect(() => {
    try {
      if (siteId == null) {
        window.localStorage.removeItem(siteStorageKey(tournamentId))
      } else {
        window.localStorage.setItem(siteStorageKey(tournamentId), String(siteId))
      }
    } catch {
      // Ignore write errors (e.g. storage disabled/full).
    }
  }, [siteId, tournamentId])

  // Zone and fixture labels are asked for: an interclubes programme names the
  // stage of every series ("Zona 2 · Fecha 3", "Final"), not just the knockout ones.
  const allEntries = useMemo<PlannerEntry[]>(() => buildPlannerEntries(tournament, { zoneLabels: true }), [tournament])
  const entriesById = useMemo(() => new Map(allEntries.map((entry) => [entry.id, entry])), [allEntries])
  /**
   * Where a series is played: the venue chosen for the whole planning, or —
   * with none chosen — the club of its home team, which is what an interclubes
   * fixture means without having to say it.
   */
  const seriesSiteIdOf = useCallback((entry: PlannerEntry): number | null => siteId ?? entry.homeSiteId, [siteId])
  const siteLabel = useCallback((id: number) => siteNames[id] ?? `Sede #${id}`, [siteNames])
  /**
   * Where each series sits right now: what the server stored, with any in-flight
   * drag applied on top. The stored venue is ignored — it is derived, not
   * chosen — but the court is the slot the series was dropped in.
   */
  const placements = useMemo<Record<number, Placement>>(() => {
    const result: Record<number, Placement> = {}

    for (const match of tournament?.matches ?? []) {
      const startMin = match.hour != null ? labelToMin(match.hour) : null

      if (match.date == null || startMin == null) {
        continue
      }

      result[match.id] = { dateIso: match.date, court: match.courtNumber ?? 1, startMin }
    }

    for (const [key, placement] of Object.entries(pendingPlacements)) {
      if (placement === null) {
        delete result[Number(key)]
      } else {
        result[Number(key)] = placement
      }
    }

    return result
  }, [tournament, pendingPlacements])
  const unplannedEntries = useMemo(
    () => allEntries.filter((entry) => !entry.locked && placements[entry.id] == null),
    [allEntries, placements]
  )
  /**
   * Pool filters. They narrow the list of series waiting to be placed and
   * nothing else: the grid always shows the full planning, otherwise filtering
   * would look like series had been unscheduled.
   */
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all')
  const [search, setSearch] = useState('')
  // Categories are only worth filtering by when there is more than one.
  const filterableCategories = useMemo(() => {
    const categories = tournament?.categories ?? []

    return categories.length > 1 ? categories : []
  }, [tournament])
  const filteredEntries = useMemo(() => {
    // Every whitespace-separated word must appear somewhere in the series, but
    // not necessarily in the same team: "andi rega" is how you look for
    // Andino vs Regatas.
    const terms = searchTerms(search)

    return unplannedEntries.filter(
      (entry) =>
        (categoryFilter === 'all' || entry.categoryId === categoryFilter) &&
        terms.every((term) => entry.searchText.includes(term))
    )
  }, [unplannedEntries, categoryFilter, search])
  const filtersActive = categoryFilter !== 'all' || search.trim() !== ''
  const clearFilters = useCallback(() => {
    setCategoryFilter('all')
    setSearch('')
  }, [])

  // A category can disappear from the tournament while it is selected; fall back
  // to showing everything instead of an empty pool with no way to tell why.
  useEffect(() => {
    if (categoryFilter !== 'all' && !filterableCategories.some((category) => category.id === categoryFilter)) {
      setCategoryFilter('all')
    }
  }, [filterableCategories, categoryFilter])
  // The days covered by the configured range.
  const days = useMemo<Dayjs[]>(() => {
    const list: Dayjs[] = []
    const last = endDate.isBefore(startDate) ? startDate : endDate
    let cursor = startDate.startOf('day')

    while (!cursor.isAfter(last, 'day') && list.length < MAX_PLANNING_DAYS) {
      list.push(cursor)
      cursor = cursor.add(1, 'day')
    }

    return list
  }, [startDate, endDate])
  // --- Persistence --------------------------------------------------------
  /**
   * Applies a placement optimistically, persists it, and rolls back if the
   * server rejects it. The optimistic entry is only dropped after the refetch,
   * so the card never flickers back to its old slot in between.
   */
  const persistPlacement = useCallback(
    async (matchId: number, placement: Placement | null, siteId: number | null) => {
      setPendingPlacements((prev) => ({ ...prev, [matchId]: placement }))

      try {
        if (placement === null) {
          await clearMatchSchedule(matchId)
        } else {
          await saveMatchSchedule(matchId, {
            siteId: siteId!,
            date: placement.dateIso,
            hour: minToLabel(placement.startMin),
            courtNumber: placement.court
          })
        }

        await refreshTournament()
      } catch {
        // The error toast is raised by the request layer; here we only make sure
        // the grid goes back to showing what the server actually holds.
      } finally {
        setPendingPlacements((prev) => {
          const next = { ...prev }

          delete next[matchId]

          return next
        })
      }
    },
    [clearMatchSchedule, saveMatchSchedule, refreshTournament]
  )

  // --- Drag & drop --------------------------------------------------------
  // Populate the persistent, already-painted ghost element so it mimics a placed
  // (grid) series card and return it for use as the drag image. Reusing a node
  // that was already rendered avoids the first-frame flash of the browser's
  // default image.
  const prepareGridGhost = (entry: PlannerEntry): { element: HTMLElement; width: number; height: number } | null => {
    const ghost = ghostRef.current

    if (!ghost) {
      return null
    }

    const columnWidth = rootRef.current?.querySelector('.court-column')?.clientWidth ?? 220
    const width = columnWidth - 4
    const height = (duration / SLOT_MIN) * ROW_HEIGHT - 4

    ghost.style.width = `${width}px`
    ghost.style.height = `${height}px`
    ghost.replaceChildren()

    const header = document.createElement('div')

    header.className = 'planner-match-header'

    const title = document.createElement('div')

    title.className = 'planner-match-title'

    const categorySpan = document.createElement('span')

    categorySpan.className = 'category'
    categorySpan.textContent = entry.category
    title.appendChild(categorySpan)

    header.appendChild(title)
    ghost.appendChild(header)

    if (entry.round || entry.consolation) {
      const metadata = document.createElement('div')

      metadata.className = 'planner-match-metadata'

      if (entry.round) {
        const roundSpan = document.createElement('span')

        roundSpan.className = 'round-badge'
        roundSpan.textContent = entry.round
        metadata.appendChild(roundSpan)
      }

      if (entry.consolation) {
        const consolationSpan = document.createElement('span')

        consolationSpan.className = 'consolation-badge'
        consolationSpan.textContent = 'C'
        metadata.appendChild(consolationSpan)
      }

      ghost.appendChild(metadata)
    }

    const body = document.createElement('div')

    body.className = 'planner-match-body'

    for (const [homeSide, name, placeholder] of [
      [true, entry.home, entry.homePlaceholder],
      [false, entry.away, entry.awayPlaceholder]
    ] as const) {
      const side = document.createElement('div')

      side.className = 'side'

      const dot = document.createElement('span')

      dot.className = `side-dot ${homeSide ? MatchSideNames[MatchSide.HOME] : MatchSideNames[MatchSide.AWAY]}`
      side.appendChild(dot)

      const nameSpan = document.createElement('span')

      nameSpan.className = `side-name ${placeholder ? 'placeholder' : ''}`
      nameSpan.textContent = name
      side.appendChild(nameSpan)

      body.appendChild(side)
    }

    ghost.appendChild(body)

    return { element: ghost, width, height }
  }

  const handleDragStart = (entry: PlannerEntry, variant: 'pool' | 'grid') => (event: DragEvent) => {
    // Resolve the drop slot from the top of the drag ghost rather than the mouse
    // pointer, so grabbing a card anywhere and dropping in place keeps its slot.
    let grabOffsetY = event.clientY - event.currentTarget.getBoundingClientRect().top

    // Pool cards have a different shape than grid cards; use the persistent,
    // already-painted grid-shaped ghost as the drag image so the preview looks
    // identical in both cases.
    if (variant === 'pool') {
      const ghost = prepareGridGhost(entry)

      if (ghost) {
        const centerX = ghost.width / 2
        const centerY = ghost.height / 2

        event.dataTransfer.setDragImage(ghost.element, centerX, centerY)
        grabOffsetY = centerY
      }
    }

    dragRef.current = { matchId: entry.id, grabOffsetY }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(entry.id))

    // Hide the series from its origin while it's being moved, without unmounting
    // it so the browser still fires `dragend` for cleanup. Hiding must wait a
    // tick: doing it synchronously cancels the in-progress browser drag.
    setTimeout(() => setDraggingId(entry.id), 0)
  }

  const handleDragEnd = () => {
    dragRef.current = null
    setDragTarget(null)
    setDraggingId(null)
  }

  // Resolve which 30-min slot the drag ghost's top falls closest to, relative to
  // the top of a column. Using the ghost top — rather than the mouse pointer —
  // means grabbing a series from anywhere on its card and dropping without
  // moving keeps it in the very same slot.
  const slotFromEvent = (event: DragEvent): number => {
    const columnTop = event.currentTarget.getBoundingClientRect().top
    const grabOffsetY = dragRef.current?.grabOffsetY ?? 0
    const ghostTop = event.clientY - grabOffsetY
    const index = Math.round((ghostTop - columnTop) / ROW_HEIGHT)
    const clamped = Math.max(0, Math.min(SLOTS.length - 1, index))

    return DAY_START_MIN + clamped * SLOT_MIN
  }

  /** The club the series being dragged is played at, if it has one. */
  const dragSiteId = (): number | null => {
    const entry = dragRef.current ? entriesById.get(dragRef.current.matchId) : undefined

    return entry ? seriesSiteIdOf(entry) : null
  }

  // Track the hovered slot + time so we can preview where the series lands.
  const handleColumnDragOver = (dateIso: string, slot: number) => (event: DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    const startMin = slotFromEvent(event)

    setDragTarget((prev) =>
      prev && prev.dateIso === dateIso && prev.slot === slot && prev.startMin === startMin
        ? prev
        : { dateIso, slot, startMin }
    )
  }

  /** Does [start, start+duration) collide with another series in the same slot that day? */
  const hasCollision = (matchId: number, dateIso: string, slot: number, startMin: number): boolean => {
    const endMin = startMin + duration

    return Object.entries(placements).some(([otherId, placement]) => {
      if (Number(otherId) === matchId) {
        return false
      }

      if (placement.dateIso !== dateIso || placement.court !== slot) {
        return false
      }

      const otherEnd = placement.startMin + duration

      return startMin < otherEnd && placement.startMin < endMin
    })
  }

  const handleColumnDrop = (dateIso: string, slot: number) => (event: DragEvent) => {
    event.preventDefault()

    const drag = dragRef.current
    const startMin = slotFromEvent(event)

    setDragTarget(null)
    setDraggingId(null)

    if (!drag) {
      return
    }

    const siteId = dragSiteId()

    dragRef.current = null

    if (siteId == null) {
      showWarningMessage('El equipo local de esta serie no tiene sede asignada')

      return
    }

    if (hasCollision(drag.matchId, dateIso, slot, startMin)) {
      showWarningMessage('Ya hay una serie en ese horario y slot')

      return
    }

    void persistPlacement(drag.matchId, { dateIso, court: slot, startMin }, siteId)
  }

  const removePlacement = (matchId: number) => {
    void persistPlacement(matchId, null, null)
  }

  // Placements grouped by day + slot for quick lookup when rendering.
  const placedByCell = useMemo(() => {
    const map = new Map<string, { entry: PlannerEntry; startMin: number }[]>()

    for (const entry of allEntries) {
      const placement = placements[entry.id]

      if (!placement) {
        continue
      }

      const key = `${placement.dateIso}#${placement.court}`
      const list = map.get(key) ?? []

      list.push({ entry, startMin: placement.startMin })
      map.set(key, list)
    }

    return map
  }, [allEntries, placements])

  if (loading) {
    return (
      <div className="tournament-planner interclubs-planner">
        <div className="planner-topbar">
          <Skeleton variant="circular" width={34} height={34} />
          <Skeleton variant="text" height={40} className="planner-title" />
          <Skeleton variant="rounded" width={150} height={32} className="planner-export-button" />
        </div>

        <div className="planner-main">
          <Paper className="planner-section config-section">
            <Skeleton variant="text" width={140} height={28} />
            <div className="config-fields">
              <Skeleton variant="rounded" height={40} className="field" />
              <Skeleton variant="rounded" height={40} className="field" />
              <Skeleton variant="rounded" height={40} className="field" />
              <Skeleton variant="rounded" height={40} className="field" />
              <Skeleton variant="rounded" height={40} className="field" />
            </div>
          </Paper>

          <Paper className="planner-section pool-section">
            <Skeleton variant="text" width={180} height={28} />
            <div className="pool-list">
              {[0, 1, 2, 3].map((key) => (
                <Skeleton key={key} variant="rounded" height={64} />
              ))}
            </div>
          </Paper>

          <Paper className="planner-section grid-section">
            <Skeleton variant="text" width={140} height={28} />
            <Skeleton variant="text" width="70%" />
            <Skeleton variant="rounded" height={420} />
          </Paper>
        </div>
      </div>
    )
  }

  if (!tournament) {
    return <Alert severity="error">Torneo no encontrado</Alert>
  }

  const slotColumns = Array.from({ length: slots }, (_, index) => index + 1)
  const slotLabel = (slot: number) => `Slot ${slot}`

  // Exports the current planning (only placed series) to a downloadable PDF: a
  // section per day, listed as a timetable.
  const handleExportPdf = () => {
    if (Object.keys(placements).length === 0) {
      showWarningMessage('No hay series planificadas para exportar')

      return
    }

    const plannerDays: InterclubsPdfDay[] = days
      .map((day) => {
        const dateIso = day.format('YYYY-MM-DD')

        return {
          heading: day.locale('es').format('dddd D [de] MMMM'),
          // Only a day gathered at one club names it. Otherwise the programme
          // says nothing: every series is at its home team's club, which is what
          // an interclubes fixture means without having to write it down.
          venue: siteId != null ? siteLabel(siteId) : null,
          series: slotColumns
            .flatMap((slot) => (placedByCell.get(`${dateIso}#${slot}`) ?? []).map((placed) => ({ ...placed, slot })))
            // The programme reads as a timetable: by hour, and inside an hour in
            // the same order the slots are shown on screen.
            .sort((a, b) => a.startMin - b.startMin || a.slot - b.slot)
            .map(({ entry, startMin }) => ({
              time: minToLabel(startMin),
              category: entry.category,
              round: entry.round ?? '',
              home: entry.home,
              away: entry.away,
              consolation: entry.consolation
            }))
        }
      })
      .filter((day) => day.series.length > 0)

    void downloadInterclubsPdf(tournament.name, plannerDays, logoSrc)
  }

  const renderSeriesChip = (entry: PlannerEntry, variant: 'pool' | 'grid') => {
    // A played series keeps its slot in the grid as a record of what happened,
    // but it is no longer part of the planning: it cannot be moved or removed.
    // Neither can one with nowhere to go — no venue chosen for the planning and
    // no club on record for its home team. Choosing a venue above unblocks it.
    const orphan = seriesSiteIdOf(entry) == null
    const draggable = !entry.locked && !orphan

    return (
      <div
        key={entry.id}
        className={`planner-match ${variant} ${entry.locked ? 'locked' : ''} ${orphan ? 'orphan' : ''} ${entry.id === draggingId ? 'dragging' : ''}`}
        draggable={draggable}
        onDragStart={draggable ? handleDragStart(entry, variant) : undefined}
        onDragEnd={draggable ? handleDragEnd : undefined}
        style={variant === 'grid' ? { height: (duration / SLOT_MIN) * ROW_HEIGHT - 4 } : undefined}
        title={orphan ? 'El equipo local no tiene sede asignada' : undefined}
      >
        <div className="planner-match-header">
          <div className="planner-match-title">
            <span className="category">{entry.category}</span>
          </div>
          {variant === 'grid' && !entry.locked && (
            <IconButton
              size="small"
              className="planner-match-remove"
              onClick={() => removePlacement(entry.id)}
              aria-label="Quitar de la planificación"
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          )}
        </div>
        {(entry.round || entry.consolation || orphan) && (
          <div className="planner-match-metadata">
            {entry.round && <span className="round-badge">{entry.round}</span>}
            {entry.consolation && <span className="consolation-badge">C</span>}
            {orphan && <span className="orphan-badge">Sin sede</span>}
          </div>
        )}
        <div className="planner-match-body">
          {/* The home side is the one hosting: its club is the column the series
              lives in, which is why it is always drawn first. */}
          <div className="side">
            <span className={`side-dot ${MatchSideNames[MatchSide.HOME]}`} />
            <span className={`side-name ${entry.homePlaceholder ? 'placeholder' : ''}`} title={entry.home}>
              {entry.home}
            </span>
          </div>
          <div className="side">
            <span className={`side-dot ${MatchSideNames[MatchSide.AWAY]}`} />
            <span className={`side-name ${entry.awayPlaceholder ? 'placeholder' : ''}`} title={entry.away}>
              {entry.away}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="es">
      <div className="tournament-planner interclubs-planner" ref={rootRef}>
        {/* Always-mounted drag image reused for pool drags (kept painted, hidden). */}
        <div ref={ghostRef} className="planner-match grid drag-ghost" aria-hidden="true" />
        <div className="planner-topbar">
          <Link href={`/tournaments/${tournamentId}`} className="back-link">
            <IconButton size="small">
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          </Link>
          <Typography variant="h5" component="h1" className="planner-title">
            Planificador de interclubes — {tournament.name}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            className="planner-export-button"
            startIcon={<PictureAsPdfIcon fontSize="small" />}
            onClick={handleExportPdf}
          >
            Exportar a PDF
          </Button>
        </div>

        <div className="planner-main">
          {/* --- Configuration section ------------------------------------- */}
          <Paper className="planner-section config-section">
            <Typography variant="subtitle1" className="section-title">
              Configuración
            </Typography>
            <div className="config-fields">
              <SiteSelector
                className="field"
                size="small"
                label="Sede"
                emptyLabel="Sede del club local"
                helperText="Elegí una sede sólo si todas las series se juegan en el mismo club (por ejemplo, las finales)"
                value={siteId}
                onChange={setSiteId}
              />
              <TextField
                className="field"
                size="small"
                label="Slots por horario"
                type="number"
                helperText="Cuántas series pueden empezar a la misma hora"
                value={slots}
                onChange={(event) => {
                  const value = Number(event.target.value)

                  setSlots(Math.max(1, Math.min(MAX_SLOTS, Number.isNaN(value) ? 1 : value)))
                }}
              />
              <DatePicker
                className="field"
                label="Desde"
                value={startDate}
                slotProps={{ textField: { size: 'small' } }}
                onChange={(value) => {
                  if (!value) {
                    return
                  }

                  setStartDate(value)

                  const maxEnd = value.add(MAX_PLANNING_DAYS - 1, 'day')

                  if (endDate.isBefore(value, 'day')) {
                    setEndDate(value)
                  } else if (endDate.isAfter(maxEnd, 'day')) {
                    setEndDate(maxEnd)
                  }
                }}
              />
              <DatePicker
                className="field"
                label="Hasta"
                value={endDate}
                minDate={startDate}
                maxDate={startDate.add(MAX_PLANNING_DAYS - 1, 'day')}
                slotProps={{ textField: { size: 'small' } }}
                onChange={(value) => value && setEndDate(value)}
              />
              <TextField
                className="field"
                size="small"
                label="Duración por serie"
                select
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
              >
                {DURATION_OPTIONS.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option >= 60
                      ? `${Math.floor(option / 60)}h${option % 60 ? ` ${option % 60}m` : ''}`
                      : `${option}m`}
                  </MenuItem>
                ))}
              </TextField>
            </div>
          </Paper>

          {/* --- Pending series section ------------------------------------ */}
          <Paper className="planner-section pool-section">
            <div className="pool-header">
              <Typography variant="subtitle1" className="section-title">
                Series pendientes{' '}
                {filtersActive
                  ? `(${filteredEntries.length} de ${unplannedEntries.length})`
                  : `(${unplannedEntries.length})`}
              </Typography>
              {unplannedEntries.length > 0 && (
                <div className="pool-filters">
                  {filterableCategories.length > 0 && (
                    <TextField
                      size="small"
                      select
                      label="Categoría"
                      value={categoryFilter}
                      onChange={(event) =>
                        setCategoryFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))
                      }
                    >
                      <MenuItem value="all">Todas las categorías</MenuItem>
                      {filterableCategories.map((category) => (
                        <MenuItem key={category.id} value={category.id}>
                          {category.category?.name ?? 'Categoría única'}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                  <TextField
                    size="small"
                    placeholder="Buscar por equipo"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon fontSize="small" />
                          </InputAdornment>
                        )
                      }
                    }}
                  />
                </div>
              )}
            </div>
            {allEntries.length === 0 ? (
              <Alert severity="info">No hay series para planificar. Activá rondas del torneo.</Alert>
            ) : unplannedEntries.length === 0 ? (
              <Typography variant="body2" color="text.secondary" className="pool-empty">
                Todas las series están planificadas. Arrastrá una serie acá para quitarla de la planificación.
              </Typography>
            ) : filteredEntries.length === 0 ? (
              <div className="pool-empty-filtered">
                <Typography variant="body2" color="text.secondary" className="pool-empty">
                  Ninguna serie pendiente coincide con el filtro.
                </Typography>
                <Button size="small" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              </div>
            ) : (
              <div className="pool-list">{filteredEntries.map((entry) => renderSeriesChip(entry, 'pool'))}</div>
            )}
          </Paper>

          {/* --- Planning grid section ------------------------------------- */}
          <Paper className="planner-section grid-section">
            <Typography variant="subtitle1" className="section-title">
              Planificación
            </Typography>
            <Typography variant="body2" color="text.secondary" className="grid-hint">
              {siteId != null
                ? `Todas las series se juegan en ${siteLabel(siteId)}: arrastrálas al día y horario que quieras.`
                : 'Cada serie se juega en la sede de su equipo local, así que sólo elegís el día, el horario y el slot. Varias series pueden compartir horario: una por slot.'}
            </Typography>
            <div className="planner-days">
              {days.map((day) => {
                const dateIso = day.format('YYYY-MM-DD')

                return (
                  <div key={dateIso} className="planner-day">
                    <Typography variant="subtitle2" className="day-title">
                      {day.locale('es').format('dddd D [de] MMMM')}
                    </Typography>
                    <div className="planner-grid" style={{ gridTemplateColumns: `64px repeat(${slots}, 1fr)` }}>
                      {/* Header row */}
                      <div className="grid-corner" />
                      {slotColumns.map((slot) => (
                        <div key={slot} className="court-header slot-header">
                          {slotLabel(slot)}
                        </div>
                      ))}

                      {/* Time gutter + slot columns */}
                      <div className="time-gutter" style={{ height: SLOTS.length * ROW_HEIGHT }}>
                        {SLOTS.map((min) => (
                          <div key={min} className="time-label" style={{ height: ROW_HEIGHT }}>
                            {minToLabel(min)}
                          </div>
                        ))}
                      </div>

                      {slotColumns.map((slot) => {
                        const placed = placedByCell.get(`${dateIso}#${slot}`) ?? []

                        return (
                          <div
                            key={slot}
                            className="court-column"
                            style={{ height: SLOTS.length * ROW_HEIGHT }}
                            onDragOver={handleColumnDragOver(dateIso, slot)}
                            onDrop={handleColumnDrop(dateIso, slot)}
                          >
                            {SLOTS.map((min) => (
                              <div key={min} className="grid-cell" style={{ height: ROW_HEIGHT }} />
                            ))}
                            {dragTarget && dragTarget.dateIso === dateIso && dragTarget.slot === slot && (
                              <div
                                className={`placed-shadow ${hasCollision(dragRef.current?.matchId ?? -1, dateIso, slot, dragTarget.startMin) ? 'invalid' : ''}`}
                                style={{
                                  top: ((dragTarget.startMin - DAY_START_MIN) / SLOT_MIN) * ROW_HEIGHT,
                                  height: (duration / SLOT_MIN) * ROW_HEIGHT - 4
                                }}
                              />
                            )}
                            {placed.map(({ entry, startMin }) => (
                              <div
                                key={entry.id}
                                className={`placed-slot ${entry.id === draggingId ? 'dragging' : ''}`}
                                style={{ top: ((startMin - DAY_START_MIN) / SLOT_MIN) * ROW_HEIGHT }}
                              >
                                {renderSeriesChip(entry, 'grid')}
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </Paper>
        </div>
      </div>
    </LocalizationProvider>
  )
}
