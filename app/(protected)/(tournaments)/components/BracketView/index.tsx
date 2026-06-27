'use client'

import './index.scss'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useUserStore } from '@/app/(auth)/stores/users'
import MatchCard from '@/app/(protected)/(tournaments)/components/MatchCard'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { RoundType } from '@/app/(protected)/(tournaments)/models/RoundType'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'

interface BracketViewProps {
  tournament: TournamentDto
  category?: number
  /** Which knockout bracket to render (main or consolation). Defaults to the main bracket. */
  roundType?: RoundType
  organizerMode?: boolean
  onEditMatch?: (match: MatchDto) => void
}

/* ---------------------------------------------------------------------------
 * Layout geometry. The bracket is rendered with an absolutely-positioned,
 * JS-computed layout (instead of flexbox) so that we can:
 *   - draw elbow connectors between a match and its next-round match,
 *   - re-base the vertical layout on the first visible round while scrolling,
 *     which keeps later rounds compact in large brackets.
 * Every position transitions via CSS, so re-basing animates smoothly.
 * ------------------------------------------------------------------------- */
const COLUMN_WIDTH = 280
const COLUMN_GAP = 56
const COL_STEP = COLUMN_WIDTH + COLUMN_GAP
const NODE_HEIGHT = 76
const NODE_VGAP = 18
const NODE_STEP = NODE_HEIGHT + NODE_VGAP
const TITLE_BAND = 40
/** Tolerance (px) before a round counts as fully scrolled past the left edge. */
const PAST_TOLERANCE = 1

interface NodeLayout {
  match: MatchDto
  roundIndex: number
  /** Left offset of the node, in px. */
  x: number
  /** Vertical center of the node within the canvas, in px. */
  yCenter: number
}

interface Segment {
  key: string
  x: number
  y: number
  w: number
  h: number
}

interface TitleLayout {
  key: number
  x: number
  label: string
}

/** Stage label for a round, counting Final/Semifinal/4tos/8vos from the end. */
function roundLabel(roundIndex: number, totalRounds: number, matchCount: number): string {
  const fromEnd = totalRounds - 1 - roundIndex

  if (fromEnd === 0 && matchCount <= 1) {
    return 'Final'
  }

  if (fromEnd === 1) {
    return 'Semifinal'
  }

  if (fromEnd === 2) {
    return 'Cuartos de final'
  }

  if (fromEnd === 3) {
    return 'Octavos de final'
  }

  return `Ronda ${roundIndex + 1}`
}

/** Horizontal knockout bracket: one column per round, with bent connectors. */
export default function BracketView({
  tournament,
  category,
  roundType = RoundType.KNOCKOUT,
  organizerMode = false,
  onEditMatch
}: BracketViewProps) {
  const userId = useUserStore((state) => state.user?.id ?? null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  /** Index of the first round still (at least partially) visible from the left. */
  const [baseRound, setBaseRound] = useState(0)
  const rounds = useMemo(() => {
    const all = tournament.rounds ?? []
    const filtered = all.filter(
      (r) => (category == null || r.tournamentCategoryId === category) && r.type === roundType
    )

    return [...filtered].sort((a, b) => a.number - b.number)
  }, [tournament.rounds, category, roundType])
  /** Matches per round, aligned to the `rounds` array and sorted by position. */
  const roundMatchLists = useMemo(() => {
    const byRound: Record<number, MatchDto[]> = {}

    for (const match of tournament.matches ?? []) {
      if (!byRound[match.roundId]) {
        byRound[match.roundId] = []
      }

      byRound[match.roundId]!.push(match)
    }

    return rounds.map((round) => (byRound[round.id] ?? []).slice().sort((a, b) => a.position - b.position))
  }, [rounds, tournament.matches])
  const { editableMatchIds, highlightedMatchIds } = useMemo(() => {
    const currentOpenRoundIds = new Set(
      (tournament.rounds ?? [])
        .filter(
          (r) =>
            // Active rounds are editable: the current frontier plus any
            // just-closed round still in its grace window.
            r.active && r.type === roundType && (category == null || r.tournamentCategoryId === category)
        )
        .map((r) => r.id)
    )

    if (currentOpenRoundIds.size === 0) {
      return { editableMatchIds: [], highlightedMatchIds: [] }
    }

    const currentOpenMatches = (tournament.matches ?? []).filter((m) => currentOpenRoundIds.has(m.roundId))

    if (organizerMode) {
      return { editableMatchIds: currentOpenMatches.map((m) => m.id), highlightedMatchIds: [] }
    }

    const userEntry = (tournament.competitors ?? []).find((c) => c.userId === userId || c.partnerUserId === userId)

    if (!userEntry) {
      return { editableMatchIds: [], highlightedMatchIds: [] }
    }

    const userMatchIds = currentOpenMatches
      .filter(
        (m) =>
          m.awayCompetitorIds !== null &&
          (m.homeCompetitorIds.includes(userEntry.id) || m.awayCompetitorIds.includes(userEntry.id))
      )
      .map((m) => m.id)

    return { editableMatchIds: userMatchIds, highlightedMatchIds: userMatchIds }
  }, [tournament, category, roundType, organizerMode, userId])
  /**
   * Full geometric layout. Rounds at/after `base` are laid out; the base round is
   * stacked compactly and each later round centers each match between its two
   * children, so the vertical spread is bounded by the base round's height.
   */
  const layout = useMemo(() => {
    const total = rounds.length
    const base = Math.min(baseRound, Math.max(0, total - 1))
    // Vertical center per match index, per round (only rounds >= base matter).
    const centers: number[][] = rounds.map(() => [])

    for (let r = base; r < total; r++) {
      const count = roundMatchLists[r].length

      if (r === base) {
        for (let i = 0; i < count; i++) {
          centers[r]![i] = i * NODE_STEP + NODE_HEIGHT / 2
        }
      } else {
        const prev = centers[r - 1]!

        for (let j = 0; j < count; j++) {
          const c1 = prev[2 * j]
          const c2 = prev[2 * j + 1]

          if (c1 != null && c2 != null) {
            centers[r]![j] = (c1 + c2) / 2
          } else if (c1 != null) {
            centers[r]![j] = c1
          } else {
            centers[r]![j] = j * NODE_STEP + NODE_HEIGHT / 2
          }
        }
      }
    }

    // Canvas height is driven by the base round (the tallest visible round).
    const baseCount = roundMatchLists[base]?.length ?? 0
    const canvasHeight = Math.max(NODE_HEIGHT, (baseCount - 1) * NODE_STEP + NODE_HEIGHT)
    const nodes: NodeLayout[] = []
    const titles: TitleLayout[] = []
    const segments: Segment[] = []

    for (let r = base; r < total; r++) {
      const x = r * COL_STEP

      titles.push({
        key: rounds[r]!.id,
        x,
        label: roundLabel(r, total, roundMatchLists[r].length)
      })

      roundMatchLists[r].forEach((match, i) => {
        nodes.push({ match, roundIndex: r, x, yCenter: centers[r]![i]! })
      })
    }

    // Elbow connectors: each match in round r joins its parent in round r+1.
    for (let r = base; r < total - 1; r++) {
      const children = roundMatchLists[r]
      const parents = roundMatchLists[r + 1]
      const childRightX = r * COL_STEP + COLUMN_WIDTH
      const midX = childRightX + COLUMN_GAP / 2
      const parentLeftX = (r + 1) * COL_STEP

      parents.forEach((parent, j) => {
        const childIdxs = [2 * j, 2 * j + 1].filter((i) => i < children.length)

        if (childIdxs.length === 0) {
          return
        }

        const childCenters = childIdxs.map((i) => centers[r]![i]!)
        const top = Math.min(...childCenters)
        const bottom = Math.max(...childCenters)

        // Vertical bar joining the children.
        if (bottom > top) {
          segments.push({ key: `v-${parent.id}`, x: midX - 1, y: top, w: 2, h: bottom - top })
        }

        // Horizontal stub out of each child.
        childIdxs.forEach((i) => {
          const child = children[i]!

          segments.push({
            key: `c-${child.id}`,
            x: childRightX,
            y: centers[r]![i]! - 1,
            w: COLUMN_GAP / 2,
            h: 2
          })
        })

        // Horizontal stub into the parent.
        segments.push({
          key: `p-${parent.id}`,
          x: midX,
          y: centers[r + 1]![j]! - 1,
          w: parentLeftX - midX,
          h: 2
        })
      })
    }

    const canvasWidth = total > 0 ? (total - 1) * COL_STEP + COLUMN_WIDTH : 0

    return { nodes, titles, segments, canvasWidth, canvasHeight }
  }, [rounds, roundMatchLists, baseRound])
  /** Recompute the first visible round from the horizontal scroll offset. */
  const handleScroll = useCallback(() => {
    if (rafRef.current != null) {
      return
    }

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const el = scrollRef.current

      if (!el) {
        return
      }

      const scrollLeft = el.scrollLeft
      let nextBase = 0

      for (let r = 0; r < rounds.length; r++) {
        if (r * COL_STEP + COLUMN_WIDTH <= scrollLeft + PAST_TOLERANCE) {
          nextBase = r + 1
        } else {
          break
        }
      }

      nextBase = Math.min(nextBase, Math.max(0, rounds.length - 1))
      setBaseRound((prev) => (prev === nextBase ? prev : nextBase))
    })
  }, [rounds.length])

  if (rounds.length === 0) {
    return null
  }

  return (
    <div className="bracket-view" ref={scrollRef} onScroll={handleScroll}>
      <div className="bracket-canvas" style={{ width: layout.canvasWidth, height: TITLE_BAND + layout.canvasHeight }}>
        <div className="titles">
          {layout.titles.map((title) => (
            <h3 key={title.key} className="round-title" style={{ transform: `translateX(${title.x}px)` }}>
              {title.label}
            </h3>
          ))}
        </div>

        <div className="connectors" style={{ top: TITLE_BAND }}>
          {layout.segments.map((seg) => (
            <span
              key={seg.key}
              className="connector"
              style={{ transform: `translate(${seg.x}px, ${seg.y}px)`, width: seg.w, height: seg.h }}
            />
          ))}
        </div>

        <div className="nodes" style={{ top: TITLE_BAND }}>
          {layout.nodes.map((node) => (
            <div
              key={node.match.id}
              className="bracket-node"
              style={{ transform: `translate(${node.x}px, ${node.yCenter - NODE_HEIGHT / 2}px)` }}
            >
              <MatchCard
                match={node.match}
                tournament={tournament}
                highlighted={highlightedMatchIds.includes(node.match.id)}
                editable={editableMatchIds.includes(node.match.id)}
                onEdit={onEditMatch}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
