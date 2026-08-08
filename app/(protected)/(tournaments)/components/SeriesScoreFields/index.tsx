'use client'

import './index.scss'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useState } from 'react'
import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { SeriesMatchScore } from '@/app/(protected)/(tournaments)/models/SeriesMatchScore'
import { SetScore } from '@/app/(protected)/(tournaments)/models/SetScore'
import { INTERCLUBS_SERIES_MATCHES } from '@/app/(protected)/(tournaments)/utils/interclubs'
import { getScoreWinner } from '@/app/(protected)/(tournaments)/utils/score'

/** A player of one of the two teams, as the pickers need them. */
export interface SeriesPlayer {
  id: number
  name: string
}

type SetInput = { home: string; away: string }

/** Raw form state of one of the three individual matches. */
interface SeriesEntry {
  double: boolean
  homePlayerIds: (number | '')[]
  awayPlayerIds: (number | '')[]
  sets: SetInput[]
  homeCount: string
  awayCount: string
}

const EMPTY_SETS: SetInput[] = [
  { home: '', away: '' },
  { home: '', away: '' },
  { home: '', away: '' }
]

/** Default line-up: one doubles first, then the two singles. */
function emptyEntries(): SeriesEntry[] {
  return Array.from({ length: INTERCLUBS_SERIES_MATCHES }, (_, index) => ({
    double: index === 0,
    homePlayerIds: index === 0 ? ['', ''] : [''],
    awayPlayerIds: index === 0 ? ['', ''] : [''],
    sets: EMPTY_SETS.map((set) => ({ ...set })),
    homeCount: '',
    awayCount: ''
  }))
}

/** Rebuilds the form state from an already-saved series, so editing shows what was loaded. */
function entriesFromScore(score: MatchScore | null): SeriesEntry[] {
  const matches = score?.matches

  if (!matches || matches.length === 0) {
    return emptyEntries()
  }

  return matches.map((match) => ({
    double: match.double,
    homePlayerIds: [...match.homePlayerIds],
    awayPlayerIds: [...match.awayPlayerIds],
    sets: EMPTY_SETS.map((_, index) => {
      const set = match.score.sets?.[index]

      return set ? { home: String(set.home), away: String(set.away) } : { home: '', away: '' }
    }),
    homeCount: match.score.home != null ? String(match.score.home) : '',
    awayCount: match.score.away != null ? String(match.score.away) : ''
  }))
}

/** Builds the individual result of one entry from its inputs. */
function entryScore(entry: SeriesEntry, format: ScoreFormat): MatchScore {
  if (format === ScoreFormat.BASIC_COUNT) {
    return {
      home: entry.homeCount === '' ? 0 : Number(entry.homeCount),
      away: entry.awayCount === '' ? 0 : Number(entry.awayCount)
    }
  }

  const sets: SetScore[] = entry.sets.map((set) => ({
    home: set.home === '' ? 0 : Number(set.home),
    away: set.away === '' ? 0 : Number(set.away)
  }))

  return { sets: sets.filter((set) => set.home !== 0 || set.away !== 0) }
}

interface SeriesScoreFieldsProps {
  format: ScoreFormat
  homeName: string
  awayName: string
  homePlayers: SeriesPlayer[]
  awayPlayers: SeriesPlayer[]
  /** Score already saved for this match, when editing. */
  initialScore: MatchScore | null
  /** Re-mounts the form state (the dialog passes its `open` flag). */
  resetKey: unknown
  onChange: (matches: SeriesMatchScore[]) => void
}

/**
 * The three individual matches of an interclubes series: each one is a doubles
 * or a single, names the players of both teams, and carries its own result.
 *
 * A player may only take part in ONE of the three, so every picker hides the
 * players already used elsewhere in the series — the rule is enforced by the
 * server too, but it is far easier to follow when the form simply does not
 * offer an invalid line-up.
 */
export default function SeriesScoreFields({
  format,
  homeName,
  awayName,
  homePlayers,
  awayPlayers,
  initialScore,
  resetKey,
  onChange
}: SeriesScoreFieldsProps) {
  const [entries, setEntries] = useState<SeriesEntry[]>(() => entriesFromScore(initialScore))

  useEffect(() => {
    setEntries(entriesFromScore(initialScore))
  }, [resetKey, initialScore])

  // Notify the parent on every edit: it owns validation and saving.
  useEffect(() => {
    onChange(
      entries.map((entry) => {
        const score = entryScore(entry, format)

        return {
          double: entry.double,
          homePlayerIds: entry.homePlayerIds.filter((id): id is number => id !== ''),
          awayPlayerIds: entry.awayPlayerIds.filter((id): id is number => id !== ''),
          score,
          winner: getScoreWinner(score, format) ?? MatchSide.HOME
        }
      })
    )
  }, [entries, format, onChange])

  const usedIds = useMemo(() => {
    const home = new Map<number, number>()
    const away = new Map<number, number>()

    entries.forEach((entry, index) => {
      entry.homePlayerIds.forEach((id) => id !== '' && home.set(id, index))
      entry.awayPlayerIds.forEach((id) => id !== '' && away.set(id, index))
    })

    return { home, away }
  }, [entries])
  const updateEntry = (index: number, patch: Partial<SeriesEntry>) =>
    setEntries((current) => current.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)))

  const handleTypeChange = (index: number, double: boolean) => {
    const slots = double ? 2 : 1

    updateEntry(index, {
      double,
      homePlayerIds: Array.from({ length: slots }, (_, slot) => entries[index].homePlayerIds[slot] ?? ''),
      awayPlayerIds: Array.from({ length: slots }, (_, slot) => entries[index].awayPlayerIds[slot] ?? '')
    })
  }

  const handlePlayerChange = (index: number, side: MatchSide, slot: number, value: number | '') => {
    const key = side === MatchSide.HOME ? 'homePlayerIds' : 'awayPlayerIds'
    const next = [...entries[index][key]]

    next[slot] = value
    updateEntry(index, { [key]: next } as Partial<SeriesEntry>)
  }

  const updateSet = (index: number, setIndex: number, side: MatchSide, raw: string) => {
    const key = side === MatchSide.HOME ? 'home' : 'away'
    const sets = entries[index].sets.map((set, i) => (i === setIndex ? { ...set, [key]: raw } : set))

    updateEntry(index, { sets })
  }

  const setLabel = (index: number) =>
    format === ScoreFormat.TWO_SETS_SUPER_TIEBREAK && index === 2 ? 'Super TB' : `Set ${index + 1}`

  /** Players a slot may still choose: the roster minus whoever plays another match. */
  const availablePlayers = (players: SeriesPlayer[], side: MatchSide, entryIndex: number, slot: number) => {
    const used = side === MatchSide.HOME ? usedIds.home : usedIds.away
    const entry = entries[entryIndex]
    const current = (side === MatchSide.HOME ? entry.homePlayerIds : entry.awayPlayerIds)[slot]

    return players.filter((player) => {
      if (player.id === current) {
        return true
      }

      const usedInEntry = used.get(player.id)

      return usedInEntry === undefined
    })
  }

  const renderPlayerPicker = (
    entryIndex: number,
    side: MatchSide,
    slot: number,
    players: SeriesPlayer[],
    label: string
  ) => {
    const entry = entries[entryIndex]
    const value = (side === MatchSide.HOME ? entry.homePlayerIds : entry.awayPlayerIds)[slot] ?? ''

    return (
      <TextField
        key={`${entryIndex}-${side}-${slot}`}
        select
        size="small"
        label={label}
        value={value === '' ? '' : String(value)}
        onChange={(event) =>
          handlePlayerChange(entryIndex, side, slot, event.target.value === '' ? '' : Number(event.target.value))
        }
        fullWidth
      >
        <MenuItem value="">Sin seleccionar</MenuItem>
        {availablePlayers(players, side, entryIndex, slot).map((player) => (
          <MenuItem key={player.id} value={String(player.id)}>
            {player.name}
          </MenuItem>
        ))}
      </TextField>
    )
  }

  return (
    <div className="series-score-fields">
      {entries.map((entry, index) => (
        <Paper key={index} variant="outlined" className="series-entry">
          <div className="series-entry-header">
            <Typography variant="subtitle2" className="series-entry-title">
              {`Partido ${index + 1}`}
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={entry.double ? 'double' : 'single'}
              onChange={(_, value) => value && handleTypeChange(index, value === 'double')}
            >
              <ToggleButton value="single">Single</ToggleButton>
              <ToggleButton value="double">Dobles</ToggleButton>
            </ToggleButtonGroup>
          </div>
          <div className="series-entry-players">
            <div className="series-entry-side">
              <span className="series-entry-team home">{homeName}</span>
              {entry.homePlayerIds.map((_, slot) =>
                renderPlayerPicker(index, MatchSide.HOME, slot, homePlayers, `Jugador ${slot + 1}`)
              )}
            </div>
            <div className="series-entry-side">
              <span className="series-entry-team away">{awayName}</span>
              {entry.awayPlayerIds.map((_, slot) =>
                renderPlayerPicker(index, MatchSide.AWAY, slot, awayPlayers, `Jugador ${slot + 1}`)
              )}
            </div>
          </div>
          {format === ScoreFormat.BASIC_COUNT ? (
            // Same shape as MatchCard's score board: home is one row, away is
            // the row below it. The team names are already named above (in
            // .series-entry-players), so the rows use the shorter "Local" /
            // "Visitante" instead of repeating them a third time.
            <div className="sets">
              <div className="set-row headers">
                <span className="side-name-spacer" />
                <span className="set-label">Games</span>
              </div>
              <div className="set-row">
                <span className="side-name home">Local</span>
                <TextField
                  type="number"
                  size="small"
                  value={entry.homeCount}
                  onChange={(event) => updateEntry(index, { homeCount: event.target.value })}
                  slotProps={{ htmlInput: { min: 0, 'aria-label': `Games ${homeName} partido ${index + 1}` } }}
                />
              </div>
              <div className="set-row">
                <span className="side-name away">Visitante</span>
                <TextField
                  type="number"
                  size="small"
                  value={entry.awayCount}
                  onChange={(event) => updateEntry(index, { awayCount: event.target.value })}
                  slotProps={{ htmlInput: { min: 0, 'aria-label': `Games ${awayName} partido ${index + 1}` } }}
                />
              </div>
            </div>
          ) : (
            <div className="sets">
              <div className="set-row headers">
                <span className="side-name-spacer" />
                {entry.sets.map((_, setIndex) => (
                  <span key={setIndex} className="set-label">
                    {setLabel(setIndex)}
                  </span>
                ))}
              </div>
              <div className="set-row">
                <span className="side-name home">Local</span>
                {entry.sets.map((set, setIndex) => (
                  <TextField
                    key={setIndex}
                    type="number"
                    size="small"
                    value={set.home}
                    onChange={(event) => updateSet(index, setIndex, MatchSide.HOME, event.target.value)}
                    slotProps={{
                      htmlInput: { min: 0, 'aria-label': `${setLabel(setIndex)} ${homeName} partido ${index + 1}` }
                    }}
                  />
                ))}
              </div>
              <div className="set-row">
                <span className="side-name away">Visitante</span>
                {entry.sets.map((set, setIndex) => (
                  <TextField
                    key={setIndex}
                    type="number"
                    size="small"
                    value={set.away}
                    onChange={(event) => updateSet(index, setIndex, MatchSide.AWAY, event.target.value)}
                    slotProps={{
                      htmlInput: { min: 0, 'aria-label': `${setLabel(setIndex)} ${awayName} partido ${index + 1}` }
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </Paper>
      ))}
    </div>
  )
}
