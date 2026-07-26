'use client'

import './index.scss'
import MenuItem from '@mui/material/MenuItem'
import Pagination from '@mui/material/Pagination'
import TextField from '@mui/material/TextField'
import { useCallback, useEffect, useState } from 'react'
import CategorySelector from '@/app/(protected)/(categories)/components/CategorySelector'
import RankingCard, { RankingCardSkeleton } from '@/app/(protected)/(rankings)/components/RankingCard'
import { useRankings } from '@/app/(protected)/(rankings)/hooks/useRankings'
import { RankingEntryDto } from '@/app/(protected)/(rankings)/models/RankingEntryDto'
import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'
import { Discipline, DisciplineNames, Disciplines } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline, SubDisciplineNames, SubDisciplines } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import MessagePanel from '@/app/components/MessagePanel'
import { useLoadingData } from '@/app/hooks/useLoadingData'

const PAGE_SIZE = 10

export default function RankingsBrowser() {
  const { getRankings } = useRankings()
  const [discipline, setDiscipline] = useState<Discipline>(Discipline.PADEL)
  const [subDiscipline, setSubDiscipline] = useState<SubDiscipline>(SubDiscipline.SINGLES)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [entries, setEntries] = useState<RankingEntryDto[]>([])
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const sub = discipline === Discipline.TENNIS ? subDiscipline : null
  // A ranking is always read for one category, so the selector's first option is
  // preselected as soon as the catalogue of the current discipline is loaded.
  const handleCategoriesLoaded = useCallback((options: CategoryDto[]) => {
    setCategoryId(options.length > 0 ? options[0].id : null)
    setLoadingCategories(false)
    setPage(1)
  }, [])

  // Changing the discipline invalidates the selected category (it belongs to the
  // previous one): drop it right away so no ranking is read with a stale filter
  // while the selector reloads its options.
  useEffect(() => {
    setCategoryId(null)
    setLoadingCategories(true)
  }, [discipline, sub])

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
        <CategorySelector
          value={categoryId}
          onChange={setCategoryId}
          discipline={discipline}
          subDiscipline={sub}
          onOptionsChange={handleCategoriesLoaded}
          label="Categoría"
          required
          size="small"
          fullWidth={false}
          className="filter"
        />
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
