'use client'

import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { useEffect, useState } from 'react'
import { useSites } from '@/app/(protected)/(sites)/hooks/useSites'
import { SiteDto } from '@/app/(protected)/(sites)/models/SiteDto'

/** Shown in place of the helper text when the organization has no sites yet. */
const EMPTY_MESSAGE = 'No hay sedes cargadas, pídele a un administrador que cree alguna sede'

interface SiteSelectorProps {
  /** Selected site id, or null when none is selected. */
  value: number | null
  onChange: (value: number | null) => void
  label?: string
  /** Option shown for "no site". Omit to force a choice. */
  emptyLabel?: string
  required?: boolean
  disabled?: boolean
  fullWidth?: boolean
  size?: 'small' | 'medium'
  className?: string
  helperText?: string
}

/**
 * Reusable selector of the venues ("sedes") of the organization, maintained by
 * the administrator in the /sites ABM.
 *
 * The catalogue is loaded once when the component mounts. While it loads, and
 * when the organization has no sites at all, the field renders disabled with an
 * explanatory message — an organizer cannot invent a venue from here, that is
 * the administrator's job.
 */
export default function SiteSelector({
  value,
  onChange,
  label = 'Sede',
  emptyLabel = 'Sin sede',
  required = false,
  disabled = false,
  fullWidth = true,
  size,
  className,
  helperText
}: SiteSelectorProps) {
  const { getAllSites } = useSites()
  const [sites, setSites] = useState<SiteDto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    getAllSites()
      .then((options) => {
        if (!cancelled) {
          setSites(options)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSites([])
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [getAllSites])

  const isEmpty = !loading && sites.length === 0
  // A site removed (or belonging to another discipline of the catalogue) would
  // leave the Select with a value that matches no option, which MUI renders as
  // an empty uncontrolled field: fall back to "no selection" in that case.
  const selectedValue = sites.some((site) => site.id === value) ? String(value) : ''

  return (
    <TextField
      select
      label={label}
      value={selectedValue}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      required={required}
      disabled={disabled || loading || isEmpty}
      fullWidth={fullWidth}
      size={size}
      className={className}
      helperText={isEmpty ? EMPTY_MESSAGE : helperText}
    >
      {!required && <MenuItem value="">{emptyLabel}</MenuItem>}
      {sites.map((site) => (
        <MenuItem key={site.id} value={String(site.id)}>
          {site.name}
        </MenuItem>
      ))}
    </TextField>
  )
}
