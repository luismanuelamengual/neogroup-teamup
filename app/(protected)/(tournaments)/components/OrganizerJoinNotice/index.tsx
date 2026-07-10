'use client'

import './index.scss'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { Role, RoleNames } from '@/app/models/Role'

/**
 * Shown when someone with the "Organizador" role opens a tournament invite
 * link (/tournaments/[id]/join). Only "Jugador" profiles can register as
 * competitors, so we explain why the join flow didn't open instead of
 * silently dropping them into the management view.
 */
export default function OrganizerJoinNotice() {
  return (
    <Paper className="organizer-join-notice">
      <InfoOutlinedIcon color="warning" className="icon" />
      <Typography variant="h6" component="h1">
        No podés unirte a este torneo
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Tenés un rol &quot;{RoleNames[Role.ORGANIZER]}&quot;, solo los perfiles con rol &quot;
        {RoleNames[Role.PLAYER]}&quot; pueden unirse al torneo.
      </Typography>
      <Button component={Link} href="/tournaments" variant="contained">
        Ir a mis torneos
      </Button>
    </Paper>
  )
}
