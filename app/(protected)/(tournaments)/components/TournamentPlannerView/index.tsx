'use client'

import 'dayjs/locale/es'
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
import { DEFAULT_SITE_COURTS, MAX_SITE_COURTS, SiteData } from '@/app/(protected)/(sites)/models/SiteData'
import { SiteDto } from '@/app/(protected)/(sites)/models/SiteDto'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { MatchSide, MatchSideNames } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import {
  buildPlannerEntries,
  DAY_START_MIN,
  DEFAULT_DURATION,
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
import { downloadPlannerPdf, PlannerPdfDay, PlannerPdfSlot } from './exportPdf'

/**
 * Match duration, in minutes. Unlike the courts configuration this is a habit of
 * the organizer rather than a property of a venue, so it stays in the browser,
 * stored once and reused across every site. It is nonetheless mirrored onto
 * whichever venue is being planned (`sites.data.matchDuration`) — see
 * `persistSiteData` — because the published schedule cannot tell a promised
 * start time from an "a partir de" one without knowing how long a match runs.
 */
const DURATION_STORAGE_KEY = 'tournamentPlanner:duration'
/**
 * Keys written by planner versions that kept state in the browser: match
 * placements and free-text custom matches (both concepts are gone — placements
 * now live on the matches themselves, and custom matches were removed), and the
 * per-site courts setup, which now belongs to the venue itself (`sites.data`,
 * migration 019) so that a player reading the published schedule sees the same
 * court names the organizer typed. Any leftovers are cleared once, when the
 * planner mounts, instead of lingering forever.
 */
const LEGACY_STORAGE_PREFIXES = [
  'tournamentPlanner:placements:',
  'tournamentPlanner:customMatches:',
  'tournamentPlanner:courts:',
  'tournamentPlanner:config'
]

function pruneLegacyPlannerStorage(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const keys: string[] = []

    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)

      if (key && LEGACY_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keys.push(key)
      }
    }

    for (const key of keys) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Ignore read/write errors (e.g. storage disabled).
  }
}

/** Reads the persisted match duration, falling back to the default. */
function loadDuration(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_DURATION
  }

  try {
    const duration = Number(window.localStorage.getItem(DURATION_STORAGE_KEY))

    return DURATION_OPTIONS.includes(duration) ? duration : DEFAULT_DURATION
  } catch {
    return DEFAULT_DURATION
  }
}

/** Identifies what is currently being dragged. */
interface DragInfo {
  matchId: number
  /** Vertical offset (px) between the grab point and the top of the match card. */
  grabOffsetY: number
}

interface TournamentPlannerViewProps {
  tournamentId: number
  /** Organization-resolved logo URL for the exported PDF header (see resolveOrganizationImage). */
  logoSrc?: string
}

export default function TournamentPlannerView({ tournamentId, logoSrc }: TournamentPlannerViewProps) {
  const { getTournament, saveMatchSchedule, clearMatchSchedule } = useTournaments()
  const { getAllSites, updateSiteData } = useSites()
  const { showWarningMessage } = useNotifications()
  const [tournament, setTournament] = useState<TournamentDto | null>(null)
  const [loading, setLoading] = useState(true)
  // Venue catalogue: it names the selected site on the exported PDF and, more
  // importantly, carries each venue's courts setup (`site.data`). The selector
  // loads its own copy; both hit the same cached endpoint.
  const [sites, setSites] = useState<SiteDto[]>([])
  // --- Configuration state ------------------------------------------------
  // The venue being planned. Every match dropped on the grid is scheduled here,
  // and the grid only shows the matches of this site — otherwise "Cancha 1" of
  // two different clubs would collide in the same column.
  const [siteId, setSiteId] = useState<number | null>(null)
  const [courts, setCourts] = useState(DEFAULT_SITE_COURTS)
  const [courtNames, setCourtNames] = useState<Record<number, string>>({})
  const [duration, setDuration] = useState(DEFAULT_DURATION)
  const [startDate, setStartDate] = useState<Dayjs>(() => dayjs().startOf('day'))
  const [endDate, setEndDate] = useState<Dayjs>(() => dayjs().startOf('day').add(2, 'day'))
  /**
   * Optimistic overlay on top of what the server says. A drag applies here
   * immediately (so the card moves without waiting for the round-trip) and the
   * entry is dropped again once the tournament is refetched — or rolled back if
   * the request fails. `null` marks a match being unscheduled.
   */
  const [pendingPlacements, setPendingPlacements] = useState<Record<number, Placement | null>>({})
  // Cell currently hovered while dragging — drives the drop-preview shadow.
  const [dragTarget, setDragTarget] = useState<Placement | null>(null)
  // Match currently being dragged — hidden from its original spot while moving.
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const dragRef = useRef<DragInfo | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  // Persistent (already-painted) element reused as the drag image for pool drags.
  const ghostRef = useRef<HTMLDivElement>(null)
  // True until the initial tournament load has seeded the site and day range, so
  // those defaults are only ever applied once.
  const initializedRef = useRef(false)
  /**
   * The courts setup as the server last knew it, and which venue it was read
   * from. It is what lets the effect below tell an actual edit apart from the
   * load that seeded the fields — without it, opening the planner would write
   * the setup straight back to the site it had just been read from.
   */
  const persistedRef = useRef<{ siteId: number | null; signature: string }>({ siteId: null, signature: '' })

  // Clear the leftovers of the previous localStorage-based planner, once.
  useEffect(() => {
    pruneLegacyPlannerStorage()
    setDuration(loadDuration())
  }, [])

  // A failure here must not block the planner: the grid still works, it just
  // falls back to the default courts setup and to no venue line on the PDF.
  useEffect(() => {
    let cancelled = false

    getAllSites()
      .then((catalogue) => {
        if (!cancelled) {
          setSites(catalogue)
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [getAllSites])

  const siteNames = useMemo(
    () => Object.fromEntries(sites.map((site) => [site.id, site.name])) as Record<number, string>,
    [sites]
  )
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
        // Open on the venue that already holds this tournament's planning (or the
        // tournament's own site when nothing is scheduled yet).
        const scheduled = (data.matches ?? []).filter((match) => match.date != null)
        const firstScheduled = scheduled.map((match) => match.date!).sort()[0]

        setSiteId(scheduled[0]?.siteId ?? data.siteId ?? null)

        // Show the days that are already planned rather than always starting at
        // "today", which would hide an existing planning behind a date change.
        if (firstScheduled) {
          const first = dayjs(firstScheduled).startOf('day')
          const last = dayjs(
            scheduled
              .map((match) => match.date!)
              .sort()
              .at(-1)!
          ).startOf('day')
          const maxEnd = first.add(MAX_PLANNING_DAYS - 1, 'day')

          setStartDate(first)
          setEndDate(last.isAfter(maxEnd, 'day') ? maxEnd : last)
        }
      })
      .finally(() => setLoading(false))
  }, [refreshTournament])

  /**
   * Load the venue's own courts setup whenever the planned site changes.
   *
   * "Cancha 3" of one club has nothing to do with "Cancha 3" of another, so
   * each venue carries its own — and it is read from the venue itself rather
   * than from this browser, so that the schedule a player opens names the
   * courts exactly as the organizer did (see migration 019-sites-data).
   */
  useEffect(() => {
    if (siteId == null || persistedRef.current.siteId === siteId) {
      return
    }

    const site = sites.find((candidate) => candidate.id === siteId)

    // The catalogue has not arrived yet: leave the fields alone rather than
    // flashing the defaults, and come back when `sites` resolves.
    if (!site) {
      return
    }

    const data = site.data ?? {}
    const storedCourts = Number(data.courts)
    const nextCourts = Number.isInteger(storedCourts)
      ? Math.max(1, Math.min(MAX_SITE_COURTS, storedCourts))
      : DEFAULT_SITE_COURTS
    // JSON object keys are strings; the planner indexes them by court number.
    const nextCourtNames = Object.fromEntries(
      Object.entries(data.courtNames ?? {}).map(([court, name]) => [Number(court), String(name)])
    )

    persistedRef.current = {
      siteId,
      signature: JSON.stringify({
        courts: nextCourts,
        courtNames: nextCourtNames,
        matchDuration: data.matchDuration ?? null
      })
    }
    setCourts(nextCourts)
    setCourtNames(nextCourtNames)
  }, [siteId, sites])

  /**
   * Store the courts setup on the venue it describes, debounced — renaming a
   * court is typed one character at a time, and each keystroke is a state
   * change. The match duration rides along (see DURATION_STORAGE_KEY): the
   * planner still chooses it per organizer, but the published schedule needs it
   * to know which start times a court can actually promise.
   */
  useEffect(() => {
    if (siteId == null || persistedRef.current.siteId !== siteId) {
      return
    }

    const data: SiteData = { courts, courtNames, matchDuration: duration }
    const signature = JSON.stringify({ courts, courtNames, matchDuration: duration })

    if (signature === persistedRef.current.signature) {
      return
    }

    const timeout = setTimeout(() => {
      persistedRef.current = { siteId, signature }
      // A failure costs the setup, not the planning: every placement is stored
      // on its own match row, so the grid keeps working and the next edit
      // retries. Nothing here is worth interrupting a drag & drop session for.
      void updateSiteData(siteId, data).catch(() => undefined)
    }, 600)

    return () => clearTimeout(timeout)
  }, [siteId, courts, courtNames, duration, updateSiteData])

  // Duration is a habit of the organizer, not of a venue: stored once.
  useEffect(() => {
    try {
      window.localStorage.setItem(DURATION_STORAGE_KEY, String(duration))
    } catch {
      // Ignore write errors (e.g. storage disabled/full).
    }
  }, [duration])

  // Resolves the display name for a court, falling back to "Cancha N" if not renamed.
  const courtLabel = useCallback((court: number) => courtNames[court]?.trim() || `Cancha ${court}`, [courtNames])
  const renameCourt = useCallback((court: number, name: string) => {
    setCourtNames((prev) => {
      const trimmed = name.trim()
      const next = { ...prev }

      if (trimmed === '' || trimmed === `Cancha ${court}`) {
        delete next[court]
      } else {
        next[court] = trimmed
      }

      return next
    })
  }, [])
  const allEntries = useMemo<PlannerEntry[]>(() => buildPlannerEntries(tournament), [tournament])
  /**
   * Where each match sits right now: what the server stored for the selected
   * venue, with any in-flight drag applied on top.
   */
  const placements = useMemo<Record<number, Placement>>(() => {
    const result: Record<number, Placement> = {}

    for (const match of tournament?.matches ?? []) {
      const startMin = match.hour != null ? labelToMin(match.hour) : null

      if (match.siteId !== siteId || match.date == null || match.courtNumber == null || startMin == null) {
        continue
      }

      result[match.id] = { dateIso: match.date, court: match.courtNumber, startMin }
    }

    for (const [key, placement] of Object.entries(pendingPlacements)) {
      if (placement === null) {
        delete result[Number(key)]
      } else {
        result[Number(key)] = placement
      }
    }

    return result
  }, [tournament, siteId, pendingPlacements])
  const unplannedEntries = useMemo(
    () => allEntries.filter((entry) => !entry.locked && placements[entry.id] == null),
    [allEntries, placements]
  )
  /**
   * Pool filters. They narrow the list of matches waiting to be placed and
   * nothing else: the grid always shows the full planning, otherwise filtering
   * would look like matches had been unscheduled.
   */
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all')
  const [search, setSearch] = useState('')
  // Categories are only worth filtering by when there is more than one.
  const filterableCategories = useMemo(() => {
    const categories = tournament?.categories ?? []

    return categories.length > 1 ? categories : []
  }, [tournament])
  const filteredEntries = useMemo(() => {
    // Every whitespace-separated word must appear somewhere in the match, but
    // not necessarily in the same competitor: "agui contre" is how you look for
    // Aguilar vs Contreras, and a single "agui" still finds every Aguilar match.
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
    async (matchId: number, placement: Placement | null) => {
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
    [clearMatchSchedule, saveMatchSchedule, refreshTournament, siteId]
  )

  // --- Drag & drop --------------------------------------------------------
  // Populate the persistent, already-painted ghost element so it mimics a placed
  // (grid) match card — sized to a real court column width and the configured
  // duration — and return it for use as the drag image. Reusing a node that was
  // already rendered avoids the first-frame flash of the browser's default image.
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
    // identical in both cases (a freshly-created element wouldn't be painted yet
    // and the browser would flash its default image for the first frame).
    if (variant === 'pool') {
      const ghost = prepareGridGhost(entry)

      if (ghost) {
        // Grab the ghost from its center, so wherever the pool card is grabbed
        // from, the dragged card is centered on the pointer.
        const centerX = ghost.width / 2
        const centerY = ghost.height / 2

        event.dataTransfer.setDragImage(ghost.element, centerX, centerY)
        grabOffsetY = centerY
      }
    }

    dragRef.current = { matchId: entry.id, grabOffsetY }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(entry.id))

    // Hide the match from its origin while it's being moved, without unmounting it
    // so the browser still fires `dragend` for cleanup. Hiding must wait a tick:
    // doing it synchronously cancels the in-progress browser drag.
    setTimeout(() => setDraggingId(entry.id), 0)
  }

  const handleDragEnd = () => {
    dragRef.current = null
    setDragTarget(null)
    setDraggingId(null)
  }

  // Resolve which 30-min slot the drag ghost's top falls closest to, relative to
  // the top of a court column. Using the ghost top — rather than the mouse
  // pointer — means grabbing a match from anywhere on its card and dropping
  // without moving keeps it in the very same slot. Rounding to the nearest slot
  // (instead of always flooring) keeps the preview aligned with the ghost's
  // actual position rather than consistently biased toward an earlier slot.
  const slotFromEvent = (event: DragEvent): number => {
    const columnTop = event.currentTarget.getBoundingClientRect().top
    const grabOffsetY = dragRef.current?.grabOffsetY ?? 0
    const ghostTop = event.clientY - grabOffsetY
    const index = Math.round((ghostTop - columnTop) / ROW_HEIGHT)
    const clamped = Math.max(0, Math.min(SLOTS.length - 1, index))

    return DAY_START_MIN + clamped * SLOT_MIN
  }

  // Track the hovered column + slot so we can preview where the match lands.
  const handleColumnDragOver = (dateIso: string, court: number) => (event: DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    const startMin = slotFromEvent(event)

    setDragTarget((prev) =>
      prev && prev.dateIso === dateIso && prev.court === court && prev.startMin === startMin
        ? prev
        : { dateIso, court, startMin }
    )
  }

  /** Does [start, start+duration) collide with another match on the same court/day? */
  const hasCollision = (matchId: number, dateIso: string, court: number, startMin: number): boolean => {
    const endMin = startMin + duration

    return Object.entries(placements).some(([otherId, placement]) => {
      if (Number(otherId) === matchId) {
        return false
      }

      if (placement.dateIso !== dateIso || placement.court !== court) {
        return false
      }

      const otherEnd = placement.startMin + duration

      return startMin < otherEnd && placement.startMin < endMin
    })
  }

  const handleColumnDrop = (dateIso: string, court: number) => (event: DragEvent) => {
    event.preventDefault()

    const drag = dragRef.current
    const startMin = slotFromEvent(event)

    setDragTarget(null)
    setDraggingId(null)

    if (!drag) {
      return
    }

    if (siteId == null) {
      showWarningMessage('Elegí una sede antes de programar')

      return
    }

    if (hasCollision(drag.matchId, dateIso, court, startMin)) {
      showWarningMessage('Ya hay un partido en ese horario y cancha')

      return
    }

    void persistPlacement(drag.matchId, { dateIso, court, startMin })
    dragRef.current = null
  }

  const removePlacement = (matchId: number) => {
    void persistPlacement(matchId, null)
  }

  // Placements grouped by day + court for quick lookup when rendering.
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
      <div className="tournament-planner">
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

  const courtColumns = Array.from({ length: courts }, (_, index) => index + 1)

  // Exports the current planning grid (only placed matches) to a downloadable PDF.
  const handleExportPdf = () => {
    if (Object.keys(placements).length === 0) {
      showWarningMessage('No hay partidos programados para exportar')

      return
    }

    const courtLabels = courtColumns.map((court) => courtLabel(court))
    // Build a court×time grid per day: rows are the distinct start times used that
    // day, columns are the courts, and each cell holds the match placed there.
    const plannerDays: PlannerPdfDay[] = days
      .map((day) => {
        const dateIso = day.format('YYYY-MM-DD')
        const startMins = Array.from(
          new Set(
            courtColumns.flatMap((court) =>
              (placedByCell.get(`${dateIso}#${court}`) ?? []).map((item) => item.startMin)
            )
          )
        ).sort((a, b) => a - b)
        const slots: PlannerPdfSlot[] = startMins.map((startMin) => ({
          time: minToLabel(startMin),
          cells: courtColumns.map((court) =>
            (placedByCell.get(`${dateIso}#${court}`) ?? [])
              .filter((item) => item.startMin === startMin)
              .map(({ entry }) => ({
                category: entry.category,
                round: entry.round ?? '—',
                home: entry.home,
                away: entry.away,
                consolation: entry.consolation
              }))
          )
        }))

        return { heading: day.locale('es').format('dddd D [de] MMMM'), slots }
      })
      .filter((day) => day.slots.length > 0)

    void downloadPlannerPdf(
      tournament.name,
      siteId != null ? (siteNames[siteId] ?? null) : null,
      courtLabels,
      plannerDays,
      logoSrc,
      duration
    )
  }

  const renderMatchChip = (entry: PlannerEntry, variant: 'pool' | 'grid') => {
    // A played match keeps its slot in the grid as a record of what happened, but
    // it is no longer part of the planning: it cannot be moved or removed.
    const draggable = !entry.locked

    return (
      <div
        key={entry.id}
        className={`planner-match ${variant} ${entry.locked ? 'locked' : ''} ${entry.id === draggingId ? 'dragging' : ''}`}
        draggable={draggable}
        onDragStart={draggable ? handleDragStart(entry, variant) : undefined}
        onDragEnd={draggable ? handleDragEnd : undefined}
        style={variant === 'grid' ? { height: (duration / SLOT_MIN) * ROW_HEIGHT - 4 } : undefined}
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
              aria-label="Quitar de la programación"
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          )}
        </div>
        {(entry.round || entry.consolation) && (
          <div className="planner-match-metadata">
            {entry.round && <span className="round-badge">{entry.round}</span>}
            {entry.consolation && <span className="consolation-badge">C</span>}
          </div>
        )}
        <div className="planner-match-body">
          {/* The names are ellipsised in a narrow column, and a derived slot
              description is long by nature, so the full text stays reachable
              on hover. */}
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
      <div className="tournament-planner" ref={rootRef}>
        {/* Always-mounted drag image reused for pool drags (kept painted, hidden). */}
        <div ref={ghostRef} className="planner-match grid drag-ghost" aria-hidden="true" />
        <div className="planner-topbar">
          <Link href={`/tournaments/${tournamentId}`} className="back-link">
            <IconButton size="small">
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          </Link>
          <Typography variant="h5" component="h1" className="planner-title">
            Programador — {tournament.name}
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
              <SiteSelector className="field" size="small" label="Sede" value={siteId} onChange={setSiteId} required />
              <TextField
                className="field"
                size="small"
                label="Canchas disponibles"
                type="number"
                value={courts}
                onChange={(event) => {
                  const value = Number(event.target.value)

                  setCourts(Math.max(1, Math.min(MAX_SITE_COURTS, Number.isNaN(value) ? 1 : value)))
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
                label="Duración por partido"
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

          {/* --- Pending matches section ----------------------------------- */}
          <Paper className="planner-section pool-section">
            <div className="pool-header">
              <Typography variant="subtitle1" className="section-title">
                Partidos pendientes{' '}
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
                    placeholder="Buscar por competidor"
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
              <Alert severity="info">No hay partidos para programar. Activá rondas del torneo.</Alert>
            ) : unplannedEntries.length === 0 ? (
              <Typography variant="body2" color="text.secondary" className="pool-empty">
                Todos los partidos están programados. Arrastrá un partido acá para quitarlo de la programación.
              </Typography>
            ) : filteredEntries.length === 0 ? (
              <div className="pool-empty-filtered">
                <Typography variant="body2" color="text.secondary" className="pool-empty">
                  Ningún partido pendiente coincide con el filtro.
                </Typography>
                <Button size="small" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              </div>
            ) : (
              <div className="pool-list">{filteredEntries.map((entry) => renderMatchChip(entry, 'pool'))}</div>
            )}
          </Paper>

          {/* --- Planning grid section ------------------------------------- */}
          <Paper className="planner-section grid-section">
            <Typography variant="subtitle1" className="section-title">
              Programación
            </Typography>
            <Typography variant="body2" color="text.secondary" className="grid-hint">
              Arrastrá los partidos a un día, cancha y horario. Podés moverlos entre celdas o devolverlos a la lista de
              pendientes.
            </Typography>
            {siteId == null && (
              <Alert severity="warning" className="grid-no-site">
                Elegí una sede para empezar a programar.
              </Alert>
            )}
            <div className="planner-days">
              {days.map((day) => {
                const dateIso = day.format('YYYY-MM-DD')

                return (
                  <div key={dateIso} className="planner-day">
                    <Typography variant="subtitle2" className="day-title">
                      {day.locale('es').format('dddd D [de] MMMM')}
                    </Typography>
                    <div className="planner-grid" style={{ gridTemplateColumns: `64px repeat(${courts}, 1fr)` }}>
                      {/* Header row */}
                      <div className="grid-corner" />
                      {courtColumns.map((court) => (
                        <div key={court} className="court-header">
                          <input
                            className="court-header-input"
                            value={courtNames[court] ?? courtLabel(court)}
                            onChange={(event) => setCourtNames((prev) => ({ ...prev, [court]: event.target.value }))}
                            onBlur={(event) => renameCourt(court, event.target.value)}
                            aria-label={`Nombre de la cancha ${court}`}
                          />
                        </div>
                      ))}

                      {/* Time gutter + court columns */}
                      <div className="time-gutter" style={{ height: SLOTS.length * ROW_HEIGHT }}>
                        {SLOTS.map((min) => (
                          <div key={min} className="time-label" style={{ height: ROW_HEIGHT }}>
                            {minToLabel(min)}
                          </div>
                        ))}
                      </div>

                      {courtColumns.map((court) => {
                        const placed = placedByCell.get(`${dateIso}#${court}`) ?? []

                        return (
                          <div
                            key={court}
                            className="court-column"
                            style={{ height: SLOTS.length * ROW_HEIGHT }}
                            onDragOver={handleColumnDragOver(dateIso, court)}
                            onDrop={handleColumnDrop(dateIso, court)}
                          >
                            {SLOTS.map((min) => (
                              <div key={min} className="grid-cell" style={{ height: ROW_HEIGHT }} />
                            ))}
                            {dragTarget && dragTarget.dateIso === dateIso && dragTarget.court === court && (
                              <div
                                className={`placed-shadow ${hasCollision(dragRef.current?.matchId ?? -1, dateIso, court, dragTarget.startMin) ? 'invalid' : ''}`}
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
                                {renderMatchChip(entry, 'grid')}
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
