'use client'

import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { useEffect, useState } from 'react'
import { useCategories } from '@/app/(protected)/(tournaments)/hooks/useCategories'
import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'

/** Shown in place of the helper text when the organization has no categories for the filters. */
const EMPTY_MESSAGE = 'No hay ninguna categoría cargada, pídele a un administrador que cree alguna categoría'

interface BaseCategorySelectorProps {
  /** Discipline whose categories are offered. */
  discipline: Discipline
  /** Sub-discipline (tennis only); null for every other discipline. */
  subDiscipline?: SubDiscipline | null
  label?: string
  /** Option shown for "no category" (single selection only, and only when not required). */
  emptyLabel?: string
  /** Categories hidden from the options (e.g. the ones a tournament already has). */
  excludedIds?: number[]
  required?: boolean
  disabled?: boolean
  fullWidth?: boolean
  size?: 'small' | 'medium'
  className?: string
  helperText?: string
  /** Notified every time the catalogue is (re)loaded. Must be a stable reference. */
  onOptionsChange?: (options: CategoryDto[]) => void
}

type SingleCategorySelectorProps = BaseCategorySelectorProps & {
  multiple?: false
  value: number | null
  onChange: (value: number | null) => void
}

type MultipleCategorySelectorProps = BaseCategorySelectorProps & {
  multiple: true
  value: number[]
  onChange: (value: number[]) => void
}

export type CategorySelectorProps = SingleCategorySelectorProps | MultipleCategorySelectorProps

/**
 * Reusable selector of the categories of the organization, maintained by the
 * administrator in the /categories ABM.
 *
 * The options are the categories of the given discipline + sub-discipline (a
 * category belongs to exactly one pair), reloaded whenever those change. While
 * they load, and when nothing matches, the field renders disabled with an
 * explanatory message: categories are no longer invented from the tournament
 * form, they are picked from the catalogue.
 *
 * Set `multiple` to let the user pick several at once (the tournament form
 * does); `value` is then a list of ids instead of a single one.
 */
export default function CategorySelector(props: CategorySelectorProps) {
  const {
    discipline,
    subDiscipline = null,
    label = 'Categorías',
    emptyLabel = 'Sin categoría',
    excludedIds,
    required = false,
    disabled = false,
    fullWidth = true,
    size,
    className,
    helperText,
    onOptionsChange
  } = props
  const { getCategories } = useCategories()
  const [categories, setCategories] = useState<CategoryDto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    getCategories(discipline, subDiscipline)
      .then((options) => {
        if (!cancelled) {
          setCategories(options)
          setLoading(false)
          onOptionsChange?.(options)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategories([])
          setLoading(false)
          onOptionsChange?.([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [discipline, getCategories, onOptionsChange, subDiscipline])

  const options = excludedIds?.length ? categories.filter((category) => !excludedIds.includes(category.id)) : categories
  const isEmpty = !loading && options.length === 0
  const namesById = new Map(categories.map((category) => [category.id, category.name]))
  // Ids that no longer match an option (a category deleted, or the discipline
  // changed) are dropped: a Select whose value matches no MenuItem renders blank.
  const selectedValue = props.multiple
    ? props.value.filter((id) => namesById.has(id)).map(String)
    : namesById.has(props.value as number)
      ? String(props.value)
      : ''

  const handleChange = (raw: string | string[]) => {
    if (props.multiple) {
      const values = (typeof raw === 'string' ? raw.split(',') : raw).filter((value) => value !== '')

      props.onChange(values.map(Number))

      return
    }

    props.onChange(raw === '' ? null : Number(raw))
  }

  return (
    <TextField
      select
      label={label}
      value={selectedValue}
      onChange={(event) => handleChange(event.target.value as string | string[])}
      required={required}
      disabled={disabled || loading || isEmpty}
      fullWidth={fullWidth}
      size={size}
      className={className}
      helperText={isEmpty ? EMPTY_MESSAGE : helperText}
      slotProps={{
        select: props.multiple
          ? {
              multiple: true,
              renderValue: (selected) => (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(selected as string[]).map((id) => (
                    <Chip key={id} size="small" label={namesById.get(Number(id)) ?? id} />
                  ))}
                </div>
              )
            }
          : undefined
      }}
    >
      {!props.multiple && !required && <MenuItem value="">{emptyLabel}</MenuItem>}
      {options.map((category) => (
        <MenuItem key={category.id} value={String(category.id)}>
          {category.name}
        </MenuItem>
      ))}
    </TextField>
  )
}
