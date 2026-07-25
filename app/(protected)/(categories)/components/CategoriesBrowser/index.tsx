'use client'

import './index.scss'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Pagination from '@mui/material/Pagination'
import TextField from '@mui/material/TextField'
import { useCallback, useEffect, useState } from 'react'
import CategoryCard, { CategoryCardSkeleton } from '@/app/(protected)/(categories)/components/CategoryCard'
import CategoryFormDialog from '@/app/(protected)/(categories)/components/CategoryFormDialog'
import { useManagedCategories } from '@/app/(protected)/(categories)/hooks/useManagedCategories'
import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'
import { Discipline, DisciplineNames, Disciplines } from '@/app/(protected)/(tournaments)/models/Discipline'
import MessagePanel from '@/app/components/MessagePanel'
import { useDebouncedValue } from '@/app/hooks/useDebouncedValue'
import { useLoadingData } from '@/app/hooks/useLoadingData'
import { useNotifications } from '@/app/hooks/useNotifications'

const PAGE_SIZE = 10

type DisciplineFilter = Discipline | 'all'

/** Categories ABM of the organization: search, create, edit and delete. */
export default function CategoriesBrowser() {
  const { getManagedCategories, deleteCategory } = useManagedCategories()
  const { showSuccessMessage } = useNotifications()
  const [queryInput, setQueryInput] = useState('')
  const debouncedQuery = useDebouncedValue(queryInput)
  const [disciplineFilter, setDisciplineFilter] = useState<DisciplineFilter>('all')
  const [categories, setCategories] = useState<CategoryDto[]>([])
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [reloadToken, setReloadToken] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editedCategory, setEditedCategory] = useState<CategoryDto | null>(null)
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryDto | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  // A new search or discipline filter always starts back on the first page.
  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, disciplineFilter])

  const { loading } = useLoadingData(async () => {
    const { data, lastPage } = await getManagedCategories({
      query: debouncedQuery.trim(),
      discipline: disciplineFilter === 'all' ? null : disciplineFilter,
      page,
      pageSize: PAGE_SIZE
    })

    setCategories(data)
    setPageCount(lastPage)
  }, [debouncedQuery, disciplineFilter, page, reloadToken])

  const openCreateForm = () => {
    setEditedCategory(null)
    setFormOpen(true)
  }

  const openEditForm = (category: CategoryDto) => {
    setEditedCategory(category)
    setFormOpen(true)
  }

  const handleSaved = () => {
    setFormOpen(false)
    reload()
  }

  const handleDelete = async () => {
    if (!categoryToDelete) {
      return
    }

    setActionLoading(true)

    try {
      await deleteCategory(categoryToDelete.id)
      showSuccessMessage('Categoría eliminada')
      setCategoryToDelete(null)
      reload()
    } catch (requestError) {}

    setActionLoading(false)
  }

  return (
    <div className="categories-browser">
      <div className="header">
        <div className="filters">
          <TextField
            size="small"
            placeholder="Buscar por nombre"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            className="query-filter"
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
          <TextField
            select
            size="small"
            label="Disciplina"
            value={disciplineFilter}
            onChange={(event) =>
              setDisciplineFilter(event.target.value === 'all' ? 'all' : (Number(event.target.value) as Discipline))
            }
            className="discipline-filter"
          >
            <MenuItem value="all">Todas</MenuItem>
            {Disciplines.map((value) => (
              <MenuItem key={value} value={value}>
                {DisciplineNames[value]}
              </MenuItem>
            ))}
          </TextField>
        </div>
        <div className="actions">
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateForm} className="create-button">
            Nueva categoría
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="list">
          {Array.from({ length: 5 }).map((_, index) => (
            <CategoryCardSkeleton key={index} />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <MessagePanel>No se encontraron categorías</MessagePanel>
      ) : (
        <>
          <div className="list">
            {categories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                onEdit={openEditForm}
                onDelete={setCategoryToDelete}
              />
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

      <CategoryFormDialog
        open={formOpen}
        category={editedCategory}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />

      <Dialog open={!!categoryToDelete} onClose={() => setCategoryToDelete(null)}>
        <DialogTitle>Eliminar categoría</DialogTitle>
        <DialogContent>
          <DialogContentText>
            ¿Estás seguro que querés eliminar la categoría &ldquo;{categoryToDelete?.name}&rdquo;? Esta acción no se
            puede deshacer.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCategoryToDelete(null)} disabled={actionLoading}>
            Cancelar
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            disabled={actionLoading}
            loading={actionLoading}
          >
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
