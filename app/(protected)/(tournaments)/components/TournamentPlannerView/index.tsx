'use client'

import 'dayjs/locale/es'
import './index.scss'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CloseIcon from '@mui/icons-material/Close'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
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
import { roundLabel } from '@/app/(protected)/(tournaments)/components/BracketView'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { MatchSide, MatchSideNames } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { isKnockoutType } from '@/app/(protected)/(tournaments)/models/RoundType'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { useNotifications } from '@/app/hooks/useNotifications'
import { downloadPlannerPdf, PlannerPdfDay, PlannerPdfSlot } from './exportPdf'

/** First selectable start time: 8:00 (in minutes from midnight). */
const DAY_START_MIN = 8 * 60
/** Last selectable start time: 23:00. */
const DAY_END_MIN = 23 * 60
/** Slot granularity: matches can be placed every 30 minutes. */
const SLOT_MIN = 30
/** Pixel height of a 30-minute slot in the planning grid. */
const ROW_HEIGHT = 44
/** Default duration of a match, in minutes (1h30). */
const DEFAULT_DURATION = 90
const DURATION_OPTIONS = [30, 60, 90, 120, 150, 180]
const MAX_COURTS = 12
/** Maximum number of days that can be planned at once. */
const MAX_PLANNING_DAYS = 10
/** localStorage key used to persist the courts/duration configuration. */
const CONFIG_STORAGE_KEY = 'tournamentPlanner:config'

interface StoredConfig {
  courts: number
  duration: number
  /** Custom court names, keyed by 1-based court number. Missing entries fall back to "Cancha N". */
  courtNames: Record<number, string>
}

/** Reads the persisted courts/duration/court-names config, falling back to defaults if absent or invalid. */
function loadStoredConfig(): StoredConfig {
  const fallback: StoredConfig = { courts: 2, duration: DEFAULT_DURATION, courtNames: {} }

  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY)

    if (!raw) {
      return fallback
    }

    const parsed = JSON.parse(raw)
    const courts = Number(parsed?.courts)
    const duration = Number(parsed?.duration)
    const courtNames: Record<number, string> = {}

    if (parsed?.courtNames && typeof parsed.courtNames === 'object') {
      for (const [key, value] of Object.entries(parsed.courtNames)) {
        const court = Number(key)

        if (Number.isFinite(court) && typeof value === 'string' && value.trim() !== '') {
          courtNames[court] = value
        }
      }
    }

    return {
      courts: Number.isFinite(courts) ? Math.max(1, Math.min(MAX_COURTS, courts)) : fallback.courts,
      duration: DURATION_OPTIONS.includes(duration) ? duration : fallback.duration,
      courtNames
    }
  } catch {
    return fallback
  }
}

/** Where a match has been placed in the planning grid. */
interface Placement {
  dateIso: string
  /** 1-based court number. */
  court: number
  /** Start time in minutes from midnight. */
  startMin: number
}

const PLACEMENTS_STORAGE_PREFIX = 'tournamentPlanner:placements:'
const placementsStorageKey = (tournamentId: number) => `${PLACEMENTS_STORAGE_PREFIX}${tournamentId}`
/**
 * How many days a tournament's planner data can sit untouched in localStorage before
 * it's considered abandoned and purged. This is deliberately based on when the data
 * was last *saved*, not on the matches' own scheduled dates — a tournament can be
 * legitimately scheduled for a day that's already in the past (an ongoing or delayed
 * event, for example), so using "today" as that cutoff would wipe out active plannings.
 */
const PLANNER_RETENTION_DAYS = 30

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isPlacementsMap(value: unknown): value is Record<number, Placement> {
  if (!value || typeof value !== 'object') {
    return false
  }

  return Object.values(value as Record<string, unknown>).every((entry) => {
    const placement = entry as { dateIso?: unknown; court?: unknown; startMin?: unknown } | null

    return (
      isIsoDate(placement?.dateIso) &&
      Number.isFinite(Number(placement?.court)) &&
      Number.isFinite(Number(placement?.startMin))
    )
  })
}

/**
 * Every persisted entry is wrapped with the date it was last saved, so staleness can be
 * judged by "when did the organizer last touch this" instead of by the dates inside it.
 */
function writeStoredEnvelope<T>(key: string, data: T): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: dayjs().format('YYYY-MM-DD'), data }))
  } catch {
    // Ignore write errors (e.g. storage disabled/full).
  }
}

/** Reads back a stored envelope, returning null if missing or malformed (does not check age). */
function readStoredEnvelope<T>(key: string, isValidData: (data: unknown) => data is T): T | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(key)

    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw)

    if (!parsed || !isIsoDate(parsed.savedAt) || !isValidData(parsed.data)) {
      return null
    }

    return parsed.data as T
  } catch {
    return null
  }
}

/** Reads the persisted match placements for a tournament, if any. */
function loadStoredPlacements(tournamentId: number): Record<number, Placement> {
  return readStoredEnvelope(placementsStorageKey(tournamentId), isPlacementsMap) ?? {}
}

/**
 * Reads, transforms and rewrites a tournament's stored placements in one step — used to
 * persist a single match's move or removal immediately, independent of whatever range
 * is currently visible (so it never clobbers matches scheduled outside the current view).
 */
function patchStoredPlacements(
  tournamentId: number,
  updater: (stored: Record<number, Placement>) => Record<number, Placement>
): void {
  if (typeof window === 'undefined') {
    return
  }

  const next = updater(loadStoredPlacements(tournamentId))

  if (Object.keys(next).length === 0) {
    try {
      window.localStorage.removeItem(placementsStorageKey(tournamentId))
    } catch {
      // Ignore write errors (e.g. storage disabled/full).
    }
  } else {
    writeStoredEnvelope(placementsStorageKey(tournamentId), next)
  }
}

/**
 * Cleans up every tournament's stored placements, so old plannings don't linger in
 * localStorage forever. Two independent rules:
 *  - a match scheduled for a day before today is dropped — its plan is over, whether
 *    or not the match itself was actually played;
 *  - a tournament that hasn't been touched at all in PLANNER_RETENTION_DAYS days is
 *    dropped entirely, even if its matches happen to be scheduled in the future
 *    (an abandoned/never-revisited planning).
 * Meant to run once, when the planner mounts.
 */
function pruneStalePlannerStorage(): void {
  if (typeof window === 'undefined') {
    return
  }

  const todayIso = dayjs().format('YYYY-MM-DD')
  const cutoffIso = dayjs().subtract(PLANNER_RETENTION_DAYS, 'day').format('YYYY-MM-DD')
  const keys: string[] = []

  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)

    if (key?.startsWith(PLACEMENTS_STORAGE_PREFIX)) {
      keys.push(key)
    }
  }

  for (const key of keys) {
    const raw = window.localStorage.getItem(key)

    if (!raw) {
      continue
    }

    try {
      const parsed = JSON.parse(raw)

      if (!isIsoDate(parsed?.savedAt) || parsed.savedAt < cutoffIso || !isPlacementsMap(parsed.data)) {
        window.localStorage.removeItem(key)
        continue
      }

      const entries = Object.entries(parsed.data as Record<string, Placement>)
      const kept = Object.fromEntries(entries.filter(([, placement]) => placement.dateIso >= todayIso))

      if (Object.keys(kept).length === 0) {
        window.localStorage.removeItem(key)
      } else if (Object.keys(kept).length !== entries.length) {
        writeStoredEnvelope(key, kept)
      }
    } catch {
      window.localStorage.removeItem(key)
    }
  }
}

/** Identifies what is currently being dragged. */
interface DragInfo {
  matchId: number
  /** Vertical offset (px) between the grab point and the top of the match card. */
  grabOffsetY: number
}

function minToLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** All selectable start slots (8:00 … 23:00). */
const SLOTS: number[] = (() => {
  const slots: number[] = []

  for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += SLOT_MIN) {
    slots.push(m)
  }

  return slots
})()

interface TournamentPlannerViewProps {
  tournamentId: number
  /** Organization-resolved logo URL for the exported PDF header (see resolveOrganizationImage). */
  logoSrc?: string
}

export default function TournamentPlannerView({ tournamentId, logoSrc }: TournamentPlannerViewProps) {
  const { getTournament } = useTournaments()
  const { showWarningMessage } = useNotifications()
  const [tournament, setTournament] = useState<TournamentDto | null>(null)
  const [loading, setLoading] = useState(true)
  // --- Configuration state (courts/duration persisted to localStorage) ----
  const [courts, setCourts] = useState(() => loadStoredConfig().courts)
  // The planner always opens on "today through +2 days" — it never restores a
  // previously configured range. What DOES get restored, for whatever range is
  // showing, is which matches localStorage says are placed on those days (see the
  // sync effect below).
  const [startDate, setStartDate] = useState<Dayjs>(() => dayjs().startOf('day'))
  const [endDate, setEndDate] = useState<Dayjs>(() => dayjs().startOf('day').add(2, 'day'))
  const [duration, setDuration] = useState(() => loadStoredConfig().duration)
  const [courtNames, setCourtNames] = useState<Record<number, string>>(() => loadStoredConfig().courtNames)
  // --- Planning state (kept in sync with localStorage by the effect below) ------
  const [placements, setPlacements] = useState<Record<number, Placement>>(() => {
    // Purge every tournament's abandoned planner data (not just this one) before
    // anything gets read back, so old plannings don't accumulate there forever.
    pruneStalePlannerStorage()

    return {}
  })
  // Always-current snapshot of `placements`, readable from effects that intentionally
  // don't list it as a dependency (so they only re-run when the range/courts change,
  // not on every drag) but still need the latest value rather than a stale closure.
  const placementsRef = useRef(placements)

  placementsRef.current = placements
  // Cell currently hovered while dragging — drives the drop-preview shadow.
  const [dragTarget, setDragTarget] = useState<Placement | null>(null)
  // Match currently being dragged — hidden from its original spot while moving.
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const dragRef = useRef<DragInfo | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  // Persistent (already-painted) element reused as the drag image for pool drags.
  const ghostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getTournament(tournamentId)
      .then((data) => setTournament(data))
      .finally(() => setLoading(false))
  }, [getTournament, tournamentId])

  // Persist courts/duration/court-names configuration so it's remembered across sessions.
  useEffect(() => {
    try {
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ courts, duration, courtNames }))
    } catch {
      // Ignore write errors (e.g. storage disabled/full).
    }
  }, [courts, duration, courtNames])

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
  const competitorsById = useMemo<Record<number, CompetitorDto>>(
    () => Object.fromEntries((tournament?.competitors ?? []).map((c) => [c.id, c])),
    [tournament]
  )
  // Category display name for each tournament category, matching the pattern
  // used elsewhere in the app (falls back to "Categoría única" when the
  // tournament has no organizer-defined categories).
  const categoryNameById = useMemo(
    () => new Map((tournament?.categories ?? []).map((c) => [c.id, c.category?.name ?? 'Categoría única'])),
    [tournament]
  )
  // Stage label ("Final", "Semifinal", "Cuartos de final", …) for each knockout
  // round, computed the same way BracketView does: rounds are grouped by
  // category + bracket (main/consolation) and counted from the last one back.
  // Rounds that aren't part of a knockout bracket (league/americano) have no
  // entry, so their matches simply show no round label.
  const roundLabelByRoundId = useMemo(() => {
    const rounds = tournament?.rounds ?? []
    const matches = tournament?.matches ?? []
    const matchCountByRoundId = new Map<number, number>()

    for (const match of matches) {
      matchCountByRoundId.set(match.roundId, (matchCountByRoundId.get(match.roundId) ?? 0) + 1)
    }

    const groups = new Map<string, typeof rounds>()

    for (const round of rounds) {
      if (!isKnockoutType(round.type)) {
        continue
      }

      const key = `${round.tournamentCategoryId}-${round.type}`
      const list = groups.get(key) ?? []

      list.push(round)
      groups.set(key, list)
    }

    const result = new Map<number, string>()

    for (const list of groups.values()) {
      const sorted = [...list].sort((a, b) => a.number - b.number)
      const total = sorted.length

      sorted.forEach((round, index) => {
        const matchCount = matchCountByRoundId.get(round.id) ?? 0

        result.set(round.id, roundLabel(index, total, matchCount))
      })
    }

    return result
  }, [tournament])
  // Rounds currently in play — only their matches can be scheduled.
  const activeRoundIds = useMemo(
    () => new Set((tournament?.rounds ?? []).filter((round) => round.active).map((round) => round.id)),
    [tournament]
  )
  // Only matches that are ready to be scheduled: belong to an active round, not
  // yet played (still pending and without a loaded result) and with both sides
  // already known (excludes byes and not-yet-defined bracket matches).
  const pendingMatches = useMemo<MatchDto[]>(
    () =>
      (tournament?.matches ?? []).filter(
        (match) =>
          activeRoundIds.has(match.roundId) &&
          match.status === MatchStatus.PENDING &&
          match.score == null &&
          match.winner == null &&
          match.homeCompetitorIds.length > 0 &&
          match.awayCompetitorIds != null &&
          match.awayCompetitorIds.length > 0
      ),
    [tournament, activeRoundIds]
  )
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

  // Keeps the visible placements in sync with localStorage every time the day range or
  // court count changes (including on mount):
  //  - matches localStorage says are scheduled within the current range/courts get
  //    pulled into view;
  //  - a match already placed in this view keeps its current slot even if localStorage
  //    disagrees (e.g. it was scheduled differently in another tab) — the in-view slot
  //    wins, and localStorage is corrected to match it;
  //  - placements that fall outside the current range/courts are dropped from view only
  //    (they stay safely persisted in localStorage; they just aren't shown right now).
  // Explicit removals (dragging a match back to the pool) are persisted immediately from
  // removePlacement itself, not here — this effect only ever adds to or corrects
  // localStorage, so it can never resurrect something the user just removed.
  useEffect(() => {
    const stored = loadStoredPlacements(tournamentId)
    const validDates = new Set(days.map((day) => day.format('YYYY-MM-DD')))
    const current = placementsRef.current
    const next: Record<number, Placement> = {}
    const winners: Record<number, Placement> = {}
    let changed = false

    for (const [key, placement] of Object.entries(current)) {
      if (validDates.has(placement.dateIso) && placement.court <= courts) {
        next[Number(key)] = placement
      } else {
        changed = true
      }
    }

    for (const [key, storedPlacement] of Object.entries(stored)) {
      if (!validDates.has(storedPlacement.dateIso)) {
        continue
      }

      const matchId = Number(key)
      const existing = next[matchId]

      if (!existing) {
        next[matchId] = storedPlacement
        changed = true
      } else if (
        existing.dateIso !== storedPlacement.dateIso ||
        existing.court !== storedPlacement.court ||
        existing.startMin !== storedPlacement.startMin
      ) {
        winners[matchId] = existing
      }
    }

    if (changed) {
      setPlacements(next)
    }

    if (Object.keys(winners).length > 0) {
      patchStoredPlacements(tournamentId, (stored2) => ({ ...stored2, ...winners }))
    }
  }, [days, courts, tournamentId])

  const unplannedMatches = useMemo(
    () => pendingMatches.filter((match) => placements[match.id] == null),
    [pendingMatches, placements]
  )
  const competitorLabel = useCallback(
    (id: number): string => {
      const competitor = competitorsById[id]

      if (!competitor) {
        return `#${id}`
      }

      return competitor.seedNumber != null ? `[${competitor.seedNumber}] ${competitor.shortName}` : competitor.shortName
    },
    [competitorsById]
  )
  const sideName = useCallback(
    (ids: number[] | null): string => {
      if (!ids || ids.length === 0) {
        return '—'
      }

      return ids.map(competitorLabel).join(' / ')
    },
    [competitorLabel]
  )

  // --- Drag & drop --------------------------------------------------------
  // Populate the persistent, already-painted ghost element so it mimics a placed
  // (grid) match card — sized to a real court column width and the configured
  // duration — and return it for use as the drag image. Reusing a node that was
  // already rendered avoids the first-frame flash of the browser's default image.
  const prepareGridGhost = (match: MatchDto): { element: HTMLElement; width: number; height: number } | null => {
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

    const categoryName = categoryNameById.get(match.tournamentCategoryId) ?? 'Categoría única'
    const roundName = roundLabelByRoundId.get(match.roundId)
    const header = document.createElement('div')

    header.className = 'planner-match-header'

    const title = document.createElement('div')

    title.className = 'planner-match-title'

    const categorySpan = document.createElement('span')

    categorySpan.className = 'category'
    categorySpan.textContent = categoryName
    title.appendChild(categorySpan)

    header.appendChild(title)
    ghost.appendChild(header)

    if (roundName) {
      const metadata = document.createElement('div')

      metadata.className = 'planner-match-metadata'

      const roundSpan = document.createElement('span')

      roundSpan.className = 'round-badge'
      roundSpan.textContent = roundName
      metadata.appendChild(roundSpan)

      ghost.appendChild(metadata)
    }

    const body = document.createElement('div')

    body.className = 'planner-match-body'

    for (const [homeSide, ids] of [
      [true, match.homeCompetitorIds],
      [false, match.awayCompetitorIds]
    ] as const) {
      const side = document.createElement('div')

      side.className = 'side'

      const dot = document.createElement('span')

      dot.className = `side-dot ${homeSide ? MatchSideNames[MatchSide.HOME] : MatchSideNames[MatchSide.AWAY]}`
      side.appendChild(dot)

      const name = document.createElement('span')

      name.className = 'side-name'
      name.textContent = sideName(ids)
      side.appendChild(name)

      body.appendChild(side)
    }

    ghost.appendChild(body)

    return { element: ghost, width, height }
  }

  const handleDragStart = (match: MatchDto, variant: 'pool' | 'grid') => (event: DragEvent) => {
    // Resolve the drop slot from the top of the drag ghost rather than the mouse
    // pointer, so grabbing a card anywhere and dropping in place keeps its slot.
    let grabOffsetY = event.clientY - event.currentTarget.getBoundingClientRect().top

    // Pool cards have a different shape than grid cards; use the persistent,
    // already-painted grid-shaped ghost as the drag image so the preview looks
    // identical in both cases (a freshly-created element wouldn't be painted yet
    // and the browser would flash its default image for the first frame).
    if (variant === 'pool') {
      const ghost = prepareGridGhost(match)

      if (ghost) {
        // Grab the ghost from its center, so wherever the pool card is grabbed
        // from, the dragged card is centered on the pointer.
        const centerX = ghost.width / 2
        const centerY = ghost.height / 2

        event.dataTransfer.setDragImage(ghost.element, centerX, centerY)
        grabOffsetY = centerY
      }
    }

    dragRef.current = { matchId: match.id, grabOffsetY }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(match.id))

    // Hide the match from its origin while it's being moved, without unmounting it
    // so the browser still fires `dragend` for cleanup. Hiding must wait a tick:
    // doing it synchronously cancels the in-progress browser drag.
    setTimeout(() => setDraggingId(match.id), 0)
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

    if (hasCollision(drag.matchId, dateIso, court, startMin)) {
      showWarningMessage('Ya hay un partido en ese horario y cancha')

      return
    }

    const placement: Placement = { dateIso, court, startMin }

    setPlacements((prev) => ({ ...prev, [drag.matchId]: placement }))
    // Persisted immediately (not left to the range-sync effect) so it survives a
    // refresh right away, and so storage never depends on the range staying put.
    patchStoredPlacements(tournamentId, (stored) => ({ ...stored, [drag.matchId]: placement }))
    dragRef.current = null
  }

  const removePlacement = (matchId: number) => {
    setPlacements((prev) => {
      const next = { ...prev }

      delete next[matchId]

      return next
    })
    // Persisted immediately so the range-sync effect never re-adopts a stale copy of
    // a match the user just unscheduled.
    patchStoredPlacements(tournamentId, (stored) => {
      const next = { ...stored }

      delete next[matchId]

      return next
    })
  }

  // Placements grouped by day + court for quick lookup when rendering.
  const placedByCell = useMemo(() => {
    const map = new Map<string, { match: MatchDto; startMin: number }[]>()

    for (const match of pendingMatches) {
      const placement = placements[match.id]

      if (!placement) {
        continue
      }

      const key = `${placement.dateIso}#${placement.court}`
      const list = map.get(key) ?? []

      list.push({ match, startMin: placement.startMin })
      map.set(key, list)
    }

    return map
  }, [pendingMatches, placements])

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
      showWarningMessage('No hay partidos planificados para exportar')

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
              (placedByCell.get(`${dateIso}#${court}`) ?? []).map((entry) => entry.startMin)
            )
          )
        ).sort((a, b) => a - b)
        const slots: PlannerPdfSlot[] = startMins.map((startMin) => ({
          time: minToLabel(startMin),
          cells: courtColumns.map((court) =>
            (placedByCell.get(`${dateIso}#${court}`) ?? [])
              .filter((entry) => entry.startMin === startMin)
              .map(({ match }) => ({
                category: categoryNameById.get(match.tournamentCategoryId) ?? 'Categoría única',
                round: roundLabelByRoundId.get(match.roundId) ?? '—',
                home: sideName(match.homeCompetitorIds),
                away: sideName(match.awayCompetitorIds)
              }))
          )
        }))

        return { heading: day.locale('es').format('dddd D [de] MMMM'), slots }
      })
      .filter((day) => day.slots.length > 0)

    void downloadPlannerPdf(tournament.name, courtLabels, plannerDays, logoSrc)
  }

  const renderMatchChip = (match: MatchDto, variant: 'pool' | 'grid') => {
    const categoryName = categoryNameById.get(match.tournamentCategoryId) ?? 'Categoría única'
    const roundName = roundLabelByRoundId.get(match.roundId)

    return (
      <div
        key={match.id}
        className={`planner-match ${variant} ${match.id === draggingId ? 'dragging' : ''}`}
        draggable
        onDragStart={handleDragStart(match, variant)}
        onDragEnd={handleDragEnd}
        style={variant === 'grid' ? { height: (duration / SLOT_MIN) * ROW_HEIGHT - 4 } : undefined}
      >
        <div className="planner-match-header">
          <div className="planner-match-title">
            <span className="category">{categoryName}</span>
          </div>
          {variant === 'grid' && (
            <IconButton
              size="small"
              className="planner-match-remove"
              onClick={() => removePlacement(match.id)}
              aria-label="Quitar de la planificación"
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          )}
        </div>
        {roundName && (
          <div className="planner-match-metadata">
            <span className="round-badge">{roundName}</span>
          </div>
        )}
        <div className="planner-match-body">
          <div className="side">
            <span className={`side-dot ${MatchSideNames[MatchSide.HOME]}`} />
            <span className="side-name">{sideName(match.homeCompetitorIds)}</span>
          </div>
          <div className="side">
            <span className={`side-dot ${MatchSideNames[MatchSide.AWAY]}`} />
            <span className="side-name">{sideName(match.awayCompetitorIds)}</span>
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
            Planificador — {tournament.name}
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
              <TextField
                className="field"
                size="small"
                label="Canchas disponibles"
                type="number"
                value={courts}
                onChange={(event) => {
                  const value = Number(event.target.value)

                  setCourts(Math.max(1, Math.min(MAX_COURTS, Number.isNaN(value) ? 1 : value)))
                }}
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
            </div>
          </Paper>

          {/* --- Pending matches section ----------------------------------- */}
          <Paper className="planner-section pool-section">
            <Typography variant="subtitle1" className="section-title">
              Partidos pendientes ({unplannedMatches.length})
            </Typography>
            {pendingMatches.length === 0 ? (
              <Alert severity="info">No hay partidos pendientes para planificar.</Alert>
            ) : unplannedMatches.length === 0 ? (
              <Typography variant="body2" color="text.secondary" className="pool-empty">
                Todos los partidos están planificados. Arrastrá un partido acá para quitarlo de la planificación.
              </Typography>
            ) : (
              <div className="pool-list">{unplannedMatches.map((match) => renderMatchChip(match, 'pool'))}</div>
            )}
          </Paper>

          {/* --- Planning grid section ------------------------------------- */}
          <Paper className="planner-section grid-section">
            <Typography variant="subtitle1" className="section-title">
              Planificación
            </Typography>
            <Typography variant="body2" color="text.secondary" className="grid-hint">
              Arrastrá los partidos a un día, cancha y horario. Podés moverlos entre celdas o devolverlos a la lista de
              pendientes.
            </Typography>
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
                            {placed.map(({ match, startMin }) => (
                              <div
                                key={match.id}
                                className={`placed-slot ${match.id === draggingId ? 'dragging' : ''}`}
                                style={{ top: ((startMin - DAY_START_MIN) / SLOT_MIN) * ROW_HEIGHT }}
                              >
                                {renderMatchChip(match, 'grid')}
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
