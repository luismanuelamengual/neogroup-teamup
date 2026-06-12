'use client'

import './TournamentSearchBar.styles.scss'
import SearchIcon from '@mui/icons-material/Search'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { useDebouncedValue } from '@/app/(tournaments)/hooks/useDebouncedValue'

export default function TournamentSearchBar({ query }: { query: string }) {
  const t = useTranslations('player')
  const router = useRouter()
  const pathname = usePathname()
  const [value, setValue] = useState(query)
  const debouncedValue = useDebouncedValue(value)

  useEffect(() => {
    if (debouncedValue !== query) {
      router.replace(debouncedValue.trim() ? `${pathname}?q=${encodeURIComponent(debouncedValue.trim())}` : pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValue])

  return (
    <TextField
      size="small"
      placeholder={t('searchPlaceholder')}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      className="tournament-search-bar"
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
  )
}
