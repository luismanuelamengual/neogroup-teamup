'use client'

import './index.scss'
import MenuItem from '@mui/material/MenuItem'
import Pagination from '@mui/material/Pagination'
import Skeleton from '@mui/material/Skeleton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import classNames from 'classnames'
import { useEffect, useState } from 'react'
import { useRankings } from '@/app/(protected)/(rankings)/hooks/useRankings'
import { RankingEntryDto } from '@/app/(protected)/(rankings)/models/RankingEntryDto'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'
import { Discipline, DisciplineNames } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline, SubDisciplineNames } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import Avatar from '@/app/components/Avatar'
import { useLoadingData } from '@/app/hooks/useLoadingData'

const PAGE_SIZE = 20
const DISCIPLINES: Discipline[] = [Discipline.PADEL, Discipline.TENNIS]
const SUB_DISCIPLINES: SubDiscipline[] = [SubDiscipline.SINGLES, SubDiscipline.DOUBLES]
const ALL_CATEGORIES = 'all'
const DISCIPLINE_LABELS: Record<string, string> = {
  padel: 'Pádel',
  tennis: 'Tenis'
}
const SUB_DISCIPLINE_LABELS: Record<string, string> = {
  singles: 'Singles',
  doubles: 'Dobles'
}

export default function RankingsBrowser() {
  const { getCategories } = useTournaments()
  const { getRankings } = useRankings()
  const [discipline, setDiscipline] = useState<Discipline>(Discipline.PADEL)
  const [subDiscipline, setSubDiscipline] = useState<SubDiscipline>(SubDiscipline.SINGLES)
  const [categoryOptions, setCategoryOptions] = useState<CategoryDto[]>([])
  const [categoryId, setCategoryId] = useState<number | typeof ALL_CATEGORIES>(ALL_CATEGORIES)
  const [entries, setEntries] = useState<RankingEntryDto[]>([])
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const sub = discipline === Discipline.TENNIS ? subDiscipline : null

  // Reload the category options when the discipline / sub-discipline changes.
  useEffect(() => {
    let cancelled = false

    setCategoryId(ALL_CATEGORIES)
    setPage(1)

    getCategories(discipline, sub)
      .then((options) => {
        if (!cancelled) {
          setCategoryOptions(options)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategoryOptions([])
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
    const { data, lastPage } = await getRankings({
      discipline,
      subDiscipline: sub,
      categoryId: categoryId === ALL_CATEGORIES ? null : categoryId,
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
          {DISCIPLINES.map((value) => (
            <MenuItem key={value} value={value}>
              {DISCIPLINE_LABELS[DisciplineNames[value]] ?? DisciplineNames[value]}
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
            {SUB_DISCIPLINES.map((value) => (
              <MenuItem key={value} value={value}>
                {SUB_DISCIPLINE_LABELS[SubDisciplineNames[value]] ?? SubDisciplineNames[value]}
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          select
          size="small"
          label="Categoría"
          value={categoryId}
          onChange={(event) =>
            setCategoryId(event.target.value === ALL_CATEGORIES ? ALL_CATEGORIES : Number(event.target.value))
          }
          className="filter"
        >
          <MenuItem value={ALL_CATEGORIES}>Todas las categorías</MenuItem>
          {categoryOptions.map((category) => (
            <MenuItem key={category.id} value={category.id}>
              {category.name}
            </MenuItem>
          ))}
        </TextField>
      </div>

      {loading ? (
        <div className="list">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="ranking-row skeleton">
              <Skeleton variant="text" width={28} />
              <Skeleton variant="circular" width={45} height={45} />
              <Skeleton variant="text" className="grow" />
              <Skeleton variant="text" width={48} />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Typography color="text.secondary" className="empty">
          Todavía no hay puntos de ranking para estos filtros
        </Typography>
      ) : (
        <>
          <div
            className={classNames('list', {
              'list-colored': page == 1
            })}
          >
            {entries.map((entry, index) => {
              const position = (page - 1) * PAGE_SIZE + index + 1

              return (
                <div key={entry.userId} className="ranking-row">
                  <span className="position">{position}</span>
                  <div className="player">
                    <Avatar email={entry.email} name={entry.displayName} size="md" className="avatar" />
                    <span className="name">{entry.displayName}</span>
                  </div>
                  <span className="points">{entry.points} pts</span>
                </div>
              )
            })}
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
