'use client'

import './index.scss'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useState } from 'react'
import { usePlayers } from '@/app/(protected)/(tournaments)/hooks/usePlayers'
import { INTERCLUBS_MIN_TEAM_PLAYERS } from '@/app/(protected)/(tournaments)/utils/interclubs'
import Avatar from '@/app/components/Avatar'
import { UserDto } from '@/app/models/UserDto'

/**
 * Everything the roster needs to show a player. Kept narrower than `UserDto` so
 * the signed-in user (a `SessionUser`, a subset of it) can be passed straight
 * in as the captain.
 */
export type RosterPlayer = Pick<UserDto, 'id' | 'email' | 'displayName'>

interface TeamRosterFieldProps {
  /** Tournament the team is being registered into (used to exclude taken players). */
  tournamentId: number
  /**
   * Player that always heads the roster and cannot be removed — the captain.
   * Null when whoever fills the form is not part of the team (organizer mode),
   * in which case the first player added becomes the captain.
   */
  captain?: RosterPlayer | null
  /** Players added so far, in roster order (the captain excluded). */
  value: RosterPlayer[]
  onChange: (players: RosterPlayer[]) => void
  /** Whether the field is usable (e.g. a category must be picked first). */
  disabled?: boolean
  minPlayers?: number
}

/**
 * Builds the roster of an interclubes team: pick a player, press "Agregar", and
 * the team grows one row at a time — the same interaction the tournament form
 * uses for categories.
 *
 * A multi-select autocomplete would need fewer clicks, but it hides the roster
 * behind a pile of chips inside the input; teams here have no fixed size (4 and
 * up) and every member matters, so the list is kept as explicit rows that can
 * be reviewed and removed one by one.
 */
export default function TeamRosterField({
  tournamentId,
  captain = null,
  value,
  onChange,
  disabled = false,
  minPlayers = INTERCLUBS_MIN_TEAM_PLAYERS
}: TeamRosterFieldProps) {
  const { getPlayersForJoin } = usePlayers()
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<UserDto[]>([])
  const [selected, setSelected] = useState<UserDto | null>(null)
  const [searching, setSearching] = useState(false)
  const roster = useMemo(() => (captain ? [captain, ...value] : value), [captain, value])
  const rosterIds = useMemo(() => roster.map((player) => player.id), [roster])

  // Player search: an empty query loads a default list so the popup is never
  // empty on open, typed queries are debounced. Players already in the roster
  // are excluded server-side so the (limited) list never fills up with them.
  useEffect(() => {
    if (disabled) {
      return
    }

    const normalized = query.trim()

    if (normalized.length === 1) {
      setOptions([])

      return
    }

    setSearching(true)

    const timeout = setTimeout(
      async () => {
        try {
          const players = await getPlayersForJoin(tournamentId, normalized, rosterIds)

          setOptions(players)
        } catch (error) {
          setOptions([])
        }

        setSearching(false)
      },
      normalized.length === 0 ? 0 : 350
    )

    return () => clearTimeout(timeout)
  }, [disabled, getPlayersForJoin, query, rosterIds, tournamentId])

  const handleAdd = () => {
    if (!selected || rosterIds.includes(selected.id)) {
      return
    }

    onChange([...value, selected])
    setSelected(null)
    setQuery('')
  }

  const handleRemove = (playerId: number) => onChange(value.filter((player) => player.id !== playerId))
  const missing = Math.max(0, minPlayers - roster.length)

  return (
    <div className="team-roster-field">
      <div className="roster-header">
        <Typography variant="subtitle1" className="roster-title">
          Jugadores del equipo
        </Typography>
        <Chip
          size="small"
          color={missing > 0 ? 'default' : 'success'}
          variant="outlined"
          label={`${roster.length} / mín. ${minPlayers}`}
        />
      </div>
      {roster.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Todavía no agregaste jugadores
        </Typography>
      )}
      {roster.map((player, index) => (
        <div key={player.id} className="roster-row">
          <div className="roster-player">
            <Avatar email={player.email} name={player.displayName} size="sm" />
            <div className="roster-player-details">
              <span className="name">{player.displayName}</span>
              <span className="email">{player.email}</span>
            </div>
            {index === 0 && <Chip size="small" label="Capitán" className="captain-chip" />}
          </div>
          {!(captain && index === 0) && (
            <IconButton aria-label={`Quitar a ${player.displayName}`} onClick={() => handleRemove(player.id)}>
              <DeleteOutlineIcon />
            </IconButton>
          )}
        </div>
      ))}
      <div className="roster-row add-row">
        <Autocomplete
          className="player-picker"
          options={options.filter((option) => !rosterIds.includes(option.id))}
          value={selected}
          loading={searching}
          disabled={disabled}
          onChange={(_, option) => setSelected(option)}
          onInputChange={(_, text) => setQuery(text)}
          getOptionLabel={(option) => option.displayName}
          isOptionEqualToValue={(option, option2) => option.id === option2.id}
          filterOptions={(available) => available}
          noOptionsText={searching ? 'Buscando...' : 'No se encontraron jugadores'}
          renderOption={(props, option) => (
            <li {...props} key={option.id}>
              <div className="team-roster-field-user-option">
                <Avatar email={option.email} name={option.displayName} size="sm" />
                <div>
                  <div className="name">{option.displayName}</div>
                  <div className="email">{option.email}</div>
                </div>
              </div>
            </li>
          )}
          renderInput={(params) => <TextField {...params} placeholder="Buscar jugador..." size="small" />}
        />
        <Button variant="outlined" onClick={handleAdd} disabled={disabled || !selected}>
          Agregar
        </Button>
      </div>
      {missing > 0 && (
        <Typography variant="caption" color="text.secondary">
          {`Falta${missing === 1 ? '' : 'n'} ${missing} jugador${missing === 1 ? '' : 'es'} para completar el equipo`}
        </Typography>
      )}
    </div>
  )
}
