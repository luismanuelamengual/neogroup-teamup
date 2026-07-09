'use client'

import './TournamentStateSelector.scss'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import ToggleButton from '@mui/material/ToggleButton'
import MuiToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import classNames from 'classnames'
import {
  TournamentStatus,
  TournamentStatuses,
  TournamentStatusNames
} from '@/app/(protected)/(tournaments)/models/TournamentStatus'

type StatusFilter = TournamentStatus | 'all'

interface TournamentStateSelectorProps {
  value: StatusFilter
  onChange: (value: StatusFilter) => void
  className?: string
}

export default function TournamentStateSelector({ value, onChange, className }: TournamentStateSelectorProps) {
  return (
    <div className={classNames('tournament-state-selector', className)}>
      <Select
        size="small"
        value={value}
        onChange={(e) => onChange(e.target.value as StatusFilter)}
        className="selector"
      >
        <MenuItem value="all">Todos</MenuItem>
        {TournamentStatuses.map((status: TournamentStatus) => (
          <MenuItem key={status} value={status}>
            {TournamentStatusNames[status]}
          </MenuItem>
        ))}
      </Select>
      <MuiToggleButtonGroup
        size="small"
        color="primary"
        exclusive
        value={value}
        onChange={(_, v: StatusFilter | null) => v && onChange(v)}
        className="toggler"
      >
        <ToggleButton value="all">Todos</ToggleButton>
        {TournamentStatuses.map((status: TournamentStatus) => (
          <ToggleButton key={status} value={status}>
            {TournamentStatusNames[status]}
          </ToggleButton>
        ))}
      </MuiToggleButtonGroup>
    </div>
  )
}
