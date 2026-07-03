'use client'

import './index.scss'
import MenuItem from '@mui/material/MenuItem'
import Pagination from '@mui/material/Pagination'
import TextField from '@mui/material/TextField'
import { useEffect, useState } from 'react'
import RankingCard, { RankingCardSkeleton } from '@/app/(protected)/(rankings)/components/RankingCard'
import { useRankings } from '@/app/(protected)/(rankings)/hooks/useRankings'
import { RankingEntryDto } from '@/app/(protected)/(rankings)/models/RankingEntryDto'
import { useCategories } from '@/app/(protected)/(tournaments)/hooks/useCategories'
import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'
import { Discipline, DisciplineNames, Disciplines } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline, SubDisciplineNames, SubDisciplines } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import MessagePanel from '@/app/components/MessagePanel'
import { useLoadingData } from '@/app/hooks/useLoadingData'

const PAGE_SIZE = 10

export default function RankingsBrowser() {
  const { getCategories } = useCategories()
  const { getRankings } = useRankings()
  const [discipline, setDiscipline] = useState<Discipline>(Discipline.PADEL)
  const [subDiscipline, setSubDiscipline] = useState<SubDiscipline>(SubDiscipline.SINGLES)
  const [categoryOptions, setCategoryOptions] = useState<CategoryDto[]>([])
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [entries, setEntries] = useState<RankingEntryDto[]>([])
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const sub = discipline === Discipline.TENNIS ? subDiscipline : null

  // Reload the category options when the discipline / sub-discipline changes.
  useEffect(() => {
    let cancelled = false

    setCategoryId(null)
    setLoadingCategories(true)
    setPage(1)

    getCategories(discipline, sub)
      .then((options) => {
        if (!cancelled) {
          setCategoryOptions(options)
          setCategoryId(options.length > 0 ? options[0].id : null)
          setLoadingCategories(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategoryOptions([])
          setLoadingCategories(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [discipline, getCategories, sub])

  // Reset to the first page whenever the category filter changes.
  useEffect(() => {
    setPage(1)
  }, [categoryId])

  const { loading } = useLoadingData(async () => {
    if (categoryId === null) {
      setEntries([])
      setPageCount(1)

      return
    }

    const { data, lastPage } = await getRankings({
      discipline,
      subDiscipline: sub,
      categoryId,
      page,
      pageSize: PAGE_SIZE
    })

    setEntries(data)
    setPageCount(lastPage)
  }, [discipline, sub, categoryId, page])

  return (
    <div className="rankings-browser">
      <div className="filters">
        <TextField
          select
          size="small"
          label="Disciplina"
          value={discipline}
          onChange={(event) => setDiscipline(Number(event.target.value) as Discipline)}
          className="filter"
        >
          {Disciplines.map((value) => (
            <MenuItem key={value} value={value}>
              {DisciplineNames[value]}
            </MenuItem>
          ))}
        </TextField>
        {discipline === Discipline.TENNIS && (
          <TextField
            select
            size="small"
            label="Modalidad"
            value={subDiscipline}
            onChange={(event) => setSubDiscipline(Number(event.target.value) as SubDiscipline)}
            className="filter"
          >
            {SubDisciplines.map((value) => (
              <MenuItem key={value} value={value}>
                {SubDisciplineNames[value]}
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          select
          size="small"
          label="Categoría"
          value={categoryId ?? ''}
          onChange={(event) => setCategoryId(event.target.value === '' ? null : Number(event.target.value))}
          className="filter"
        >
          <MenuItem value="" disabled>
            Seleccioná una categoría
          </MenuItem>
          {categoryOptions.map((category) => (
            <MenuItem key={category.id} value={category.id}>
              {category.name}
            </MenuItem>
          ))}
        </TextField>
      </div>

      {loadingCategories || (categoryId !== null && loading) ? (
        <div className="list">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <RankingCardSkeleton key={i} />
          ))}
        </div>
      ) : categoryId === null ? (
        <MessagePanel>Elegí una categoría para ver el ranking</MessagePanel>
      ) : entries.length === 0 ? (
        <MessagePanel>Todavía no hay puntos de ranking para estos filtros</MessagePanel>
      ) : (
        <>
          <div className="list">
            {entries.map((entry, index) => (
              <RankingCard key={entry.userId} entry={entry} position={(page - 1) * PAGE_SIZE + index + 1} />
            ))}
          </div>
          {pageCount > 1 && (
            <Pagination
              className="paginator"
              count={pageCount}
              page={page}
              onChange={(_, value) => setPage(value)}
              color="primary"
            />
          )}
        </>
      )}
    </div>
  )
}
