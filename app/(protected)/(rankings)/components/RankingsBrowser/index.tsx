'use client'

import './index.scss'
import Pagination from '@mui/material/Pagination'
import { useCallback, useEffect, useState } from 'react'
import CategorySelector from '@/app/(protected)/(categories)/components/CategorySelector'
import RankingCard, { RankingCardSkeleton } from '@/app/(protected)/(rankings)/components/RankingCard'
import { useRankings } from '@/app/(protected)/(rankings)/hooks/useRankings'
import { RankingEntryDto } from '@/app/(protected)/(rankings)/models/RankingEntryDto'
import DisciplineSelector from '@/app/(protected)/(tournaments)/components/DisciplineSelector'
import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import MessagePanel from '@/app/components/MessagePanel'
import { useLoadingData } from '@/app/hooks/useLoadingData'

const PAGE_SIZE = 10

export default function RankingsBrowser() {
  const { getRankings } = useRankings()
  const [discipline, setDiscipline] = useState<Discipline>(Discipline.PADEL)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [entries, setEntries] = useState<RankingEntryDto[]>([])
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
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
  }, [discipline])

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
      categoryId,
      page,
      pageSize: PAGE_SIZE
    })

    setEntries(data)
    setPageCount(lastPage)
  }, [discipline, categoryId, page])

  return (
    <div className="rankings-browser">
      <div className="filters">
        <DisciplineSelector value={discipline} onChange={setDiscipline} size="small" className="filter" />
        <CategorySelector
          value={categoryId}
          onChange={setCategoryId}
          discipline={discipline}
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
