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
import Pagination from '@mui/material/Pagination'
import TextField from '@mui/material/TextField'
import { useCallback, useEffect, useState } from 'react'
import SiteCard, { SiteCardSkeleton } from '@/app/(protected)/(sites)/components/SiteCard'
import SiteFormDialog from '@/app/(protected)/(sites)/components/SiteFormDialog'
import { useSites } from '@/app/(protected)/(sites)/hooks/useSites'
import { SiteDto } from '@/app/(protected)/(sites)/models/SiteDto'
import MessagePanel from '@/app/components/MessagePanel'
import { useDebouncedValue } from '@/app/hooks/useDebouncedValue'
import { useLoadingData } from '@/app/hooks/useLoadingData'
import { useNotifications } from '@/app/hooks/useNotifications'

const PAGE_SIZE = 10

/** Sites ABM of the organization: search, create, edit and delete. */
export default function SitesBrowser() {
  const { getSites, deleteSite } = useSites()
  const { showSuccessMessage } = useNotifications()
  const [queryInput, setQueryInput] = useState('')
  const debouncedQuery = useDebouncedValue(queryInput)
  const [sites, setSites] = useState<SiteDto[]>([])
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [reloadToken, setReloadToken] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editedSite, setEditedSite] = useState<SiteDto | null>(null)
  const [siteToDelete, setSiteToDelete] = useState<SiteDto | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  // A new search always starts back on the first page.
  useEffect(() => {
    setPage(1)
  }, [debouncedQuery])

  const { loading } = useLoadingData(async () => {
    const { data, lastPage } = await getSites({ query: debouncedQuery.trim(), page, pageSize: PAGE_SIZE })

    setSites(data)
    setPageCount(lastPage)
  }, [debouncedQuery, page, reloadToken])

  const openCreateForm = () => {
    setEditedSite(null)
    setFormOpen(true)
  }

  const openEditForm = (site: SiteDto) => {
    setEditedSite(site)
    setFormOpen(true)
  }

  const handleSaved = () => {
    setFormOpen(false)
    reload()
  }

  const handleDelete = async () => {
    if (!siteToDelete) {
      return
    }

    setActionLoading(true)

    try {
      await deleteSite(siteToDelete.id)
      showSuccessMessage('Sede eliminada')
      setSiteToDelete(null)
      reload()
    } catch (requestError) {}

    setActionLoading(false)
  }

  return (
    <div className="sites-browser">
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
        </div>
        <div className="actions">
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateForm} className="create-button">
            Nueva sede
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="list">
          {Array.from({ length: 5 }).map((_, index) => (
            <SiteCardSkeleton key={index} />
          ))}
        </div>
      ) : sites.length === 0 ? (
        <MessagePanel>No se encontraron sedes</MessagePanel>
      ) : (
        <>
          <div className="list">
            {sites.map((site) => (
              <SiteCard key={site.id} site={site} onEdit={openEditForm} onDelete={setSiteToDelete} />
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

      <SiteFormDialog open={formOpen} site={editedSite} onClose={() => setFormOpen(false)} onSaved={handleSaved} />

      <Dialog open={!!siteToDelete} onClose={() => setSiteToDelete(null)}>
        <DialogTitle>Eliminar sede</DialogTitle>
        <DialogContent>
          <DialogContentText>
            ¿Estás seguro que querés eliminar la sede &ldquo;{siteToDelete?.name}&rdquo;? Esta acción no se puede
            deshacer.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSiteToDelete(null)} disabled={actionLoading}>
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
