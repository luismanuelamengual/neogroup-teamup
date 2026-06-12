'use client'

import './index.scss'
import SearchIcon from '@mui/icons-material/Search'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputAdornment from '@mui/material/InputAdornment'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { useDebouncedValue } from '@/app/(tournaments)/hooks/useDebouncedValue'

interface TournamentFiltersProps {
  name: string
  onlyActive: boolean
}

export default function TournamentFilters({ name, onlyActive }: TournamentFiltersProps) {
  const t = useTranslations('organizer')
  const router = useRouter()
  const pathname = usePathname()
  const [nameValue, setNameValue] = useState(name)
  const debouncedName = useDebouncedValue(nameValue)

  const applyFilters = (nextName: string, nextOnlyActive: boolean) => {
    const params = new URLSearchParams()

    if (nextName.trim()) {
      params.set('name', nextName.trim())
    }

    if (nextOnlyActive) {
      params.set('active', '1')
    }

    router.replace(params.size > 0 ? `${pathname}?${params.toString()}` : pathname)
  }

  // Debounced name filter.
  useEffect(() => {
    if (debouncedName !== name) {
      applyFilters(debouncedName, onlyActive)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedName])

  return (
    <div className="tournament-filters">
      <TextField
        size="small"
        placeholder={t('filterByName')}
        value={nameValue}
        onChange={(event) => setNameValue(event.target.value)}
        className="name"
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
      <FormControlLabel
        control={<Switch checked={onlyActive} onChange={(event) => applyFilters(nameValue, event.target.checked)} />}
        label={t('onlyActive')}
      />
    </div>
  )
}
