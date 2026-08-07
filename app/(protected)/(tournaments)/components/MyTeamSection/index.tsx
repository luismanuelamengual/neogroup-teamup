'use client'

import './index.scss'
import GroupsIcon from '@mui/icons-material/Groups'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import TeamRosterField, { RosterPlayer } from '@/app/(protected)/(tournaments)/components/TeamRosterField'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import { INTERCLUBS_MIN_TEAM_PLAYERS } from '@/app/(protected)/(tournaments)/utils/interclubs'

interface MyTeamSectionProps {
  tournamentId: number
  /** The signed-in user's own competitor (a team they captain). */
  competitor: CompetitorDto
  /** Reloads the tournament after a successful save. */
  onUpdated: () => Promise<void> | void
}

/**
 * "Mi equipo": lets the captain of an interclubes team review its roster and
 * add/remove team mates while the tournament is still in registration.
 * `TournamentView` only renders this for the team's captain (`playerIds[0]`)
 * and only before the tournament starts — the server enforces both the same
 * way (see `updateTeamRoster`).
 */
export default function MyTeamSection({ tournamentId, competitor, onUpdated }: MyTeamSectionProps) {
  const { updateTeamRoster } = useTournaments()
  const [captain, ...currentMates] = competitor.players ?? []
  const [mates, setMates] = useState<RosterPlayer[]>(currentMates)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const teamSize = mates.length + 1

  // Re-syncs the local draft whenever the competitor changes underneath it
  // (e.g. after a successful save reloads the tournament, or another tab made
  // changes) so a stale draft never lingers on screen.
  useEffect(() => {
    const [, ...mates] = competitor.players ?? []

    setMates(mates)
    setDirty(false)
  }, [competitor])

  const handleChange = (updated: RosterPlayer[]) => {
    setMates(updated)
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)

    try {
      await updateTeamRoster(
        tournamentId,
        mates.map((player) => player.id)
      )
      setDirty(false)
      await onUpdated()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Paper className="section my-team-section">
      <Typography variant="h6" className="section-title">
        <GroupsIcon fontSize="small" /> Mi equipo
      </Typography>
      <TeamRosterField tournamentId={tournamentId} captain={captain} value={mates} onChange={handleChange} />
      {dirty && (
        <div className="my-team-actions">
          {teamSize < INTERCLUBS_MIN_TEAM_PLAYERS && (
            <Alert severity="warning" className="my-team-alert">
              El equipo necesita al menos {INTERCLUBS_MIN_TEAM_PLAYERS} jugadores para poder guardar los cambios.
            </Alert>
          )}
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || teamSize < INTERCLUBS_MIN_TEAM_PLAYERS}
            loading={saving}
          >
            Guardar cambios
          </Button>
        </div>
      )}
    </Paper>
  )
}
