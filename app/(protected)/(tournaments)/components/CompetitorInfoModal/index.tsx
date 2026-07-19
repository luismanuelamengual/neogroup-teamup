'use client'

import './index.scss'
import CloseIcon from '@mui/icons-material/Close'
import PhoneIcon from '@mui/icons-material/Phone'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import Avatar from '@/app/components/Avatar'

interface CompetitorInfoModalProps {
  open: boolean
  competitors: CompetitorDto[]
  onClose: () => void
}

interface PersonCardProps {
  firstName: string | null
  lastName: string | null
  phoneNumber: string | null
  email: string
}

function PersonCard({ firstName, lastName, phoneNumber, email }: PersonCardProps) {
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || email || '—'

  return (
    <div className="competitor-info-modal-person">
      <Avatar email={email} name={displayName} size="lg" />
      <div className="competitor-info-modal-person-details">
        <Typography variant="subtitle1" className="name">
          {displayName}
        </Typography>
        {phoneNumber && (
          <div className="phone">
            <PhoneIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {phoneNumber}
            </Typography>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CompetitorInfoModal({ open, competitors, onClose }: CompetitorInfoModalProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle className="competitor-info-modal-title">
        Información del competidor
        <IconButton size="small" onClick={onClose} className="close-btn">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent className="competitor-info-modal-content">
        {competitors.map((competitor, index) => {
          const players = competitor.players ?? []

          return (
            <div key={competitor.id}>
              {index > 0 && <Divider className="competitor-divider" />}
              {players.length > 0 ? (
                players.map((player, playerIndex) => (
                  <div key={playerIndex}>
                    {playerIndex > 0 && <Divider className="competitor-divider" />}
                    <PersonCard
                      firstName={player.firstName}
                      lastName={player.lastName}
                      phoneNumber={player.phoneNumber}
                      email={player.email}
                    />
                  </div>
                ))
              ) : (
                <div className="competitor-info-modal-person">
                  <Avatar email="" name={competitor.displayName} size="lg" />
                  <div className="competitor-info-modal-person-details">
                    <Typography variant="subtitle1" className="name">
                      {competitor.displayName}
                    </Typography>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </DialogContent>
    </Dialog>
  )
}
