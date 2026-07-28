'use client'

import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { useEffect } from 'react'
import { useEnabledDisciplines } from '@/app/(protected)/(tournaments)/hooks/useEnabledDisciplines'
import { Discipline, DisciplineNames } from '@/app/(protected)/(tournaments)/models/Discipline'

interface BaseDisciplineSelectorProps {
  label?: string
  disabled?: boolean
  fullWidth?: boolean
  size?: 'small' | 'medium'
  className?: string
  /**
   * Keeps `value` displayed and selected even when it is not one of
   * `enabledDisciplines`, instead of auto-correcting it away. For editing a
   * record whose discipline the organization has since disabled — it should
   * stay as-is until the admin actively picks a different (enabled) one, not
   * get silently swapped out just because the form was opened (see
   * CategoryFormDialog). The organization's enabled disciplines are still
   * offered alongside it as alternatives. Ignored when `withAll` is set — an
   * "every discipline" filter has no invalid value to begin with.
   */
  allowCurrentValue?: boolean
}

type FixedDisciplineSelectorProps = BaseDisciplineSelectorProps & {
  withAll?: false
  value: Discipline
  onChange: (value: Discipline) => void
}

type WithAllDisciplineSelectorProps = BaseDisciplineSelectorProps & {
  withAll: true
  /** Label of the "every discipline" option. */
  allLabel?: string
  value: Discipline | 'all'
  onChange: (value: Discipline | 'all') => void
}

export type DisciplineSelectorProps = FixedDisciplineSelectorProps | WithAllDisciplineSelectorProps

/**
 * Reusable selector of the disciplines enabled for the organization
 * (`Organization.enabledDisciplines`, see migration 011).
 *
 * Unlike CategorySelector/SiteSelector — where landing on "no valid selection"
 * is a fine resting state — a discipline is always required, and the
 * catalogue can be a single entry, so leaving it up to the caller to notice
 * an invalid value would either force a pointless click (single-entry
 * catalogue) or render a blank Select. By default this component keeps
 * `value` valid on the caller's behalf: whenever it is not (or not yet) one
 * of `enabledDisciplines`, it calls `onChange` with the first one. That
 * covers two cases with the same fix: the very first render of a caller whose
 * initial state was chosen before the organization store had hydrated
 * (enabledDisciplines briefly empty), and an organization disabling the
 * selected discipline while the screen is open.
 *
 * Pass `allowCurrentValue` to opt out of that auto-correction for a value
 * that is legitimately grandfathered in (see above), or `withAll` to add an
 * "every discipline" option for a filter — a value of `'all'` is always
 * valid, so it is never auto-corrected either.
 */
export default function DisciplineSelector(props: DisciplineSelectorProps) {
  const { label = 'Disciplina', disabled = false, fullWidth, size, className, allowCurrentValue = false } = props
  const enabledDisciplines = useEnabledDisciplines()
  const isDiscipline = props.value !== 'all'
  const isValueEnabled = isDiscipline && enabledDisciplines.includes(props.value as Discipline)

  useEffect(() => {
    if (allowCurrentValue || !isDiscipline) {
      return
    }

    if (enabledDisciplines.length > 0 && !isValueEnabled) {
      props.onChange(enabledDisciplines[0])
    }
    // Only react to the catalogue resolving/changing (or the grandfathering
    // flag / an 'all' selection). `value`/`onChange`/`isValueEnabled` are
    // deliberately not dependencies: the guard above already makes this a
    // no-op once the selection is valid, so depending on them would only add
    // pointless re-runs on every manual selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledDisciplines, allowCurrentValue, isDiscipline])

  // A grandfathered value that is not (or no longer) enabled is still offered
  // as an option — otherwise the Select would render blank — alongside every
  // enabled discipline, in case the admin wants to actively move it.
  const options =
    isValueEnabled || !allowCurrentValue || !isDiscipline
      ? enabledDisciplines
      : [props.value as Discipline, ...enabledDisciplines]
  const selectedValue = !isDiscipline ? 'all' : options.includes(props.value as Discipline) ? props.value : ''

  const handleChange = (raw: string) => {
    if (props.withAll && raw === 'all') {
      props.onChange('all')

      return
    }

    props.onChange(Number(raw) as Discipline)
  }

  return (
    <TextField
      select
      label={label}
      value={selectedValue}
      onChange={(event) => handleChange(event.target.value)}
      disabled={disabled}
      fullWidth={fullWidth}
      size={size}
      className={className}
    >
      {props.withAll && <MenuItem value="all">{props.allLabel ?? 'Todas'}</MenuItem>}
      {options.map((discipline) => (
        <MenuItem key={discipline} value={discipline}>
          {DisciplineNames[discipline]}
          {enabledDisciplines.includes(discipline) ? '' : ' (deshabilitada)'}
        </MenuItem>
      ))}
    </TextField>
  )
}
