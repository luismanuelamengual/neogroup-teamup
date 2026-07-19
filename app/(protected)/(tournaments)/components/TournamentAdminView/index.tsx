'use client'

import './index.scss'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCategories } from '@/app/(protected)/(tournaments)/hooks/useCategories'
import { usePlayers } from '@/app/(protected)/(tournaments)/hooks/usePlayers'
import { useTournamentAdmin } from '@/app/(protected)/(tournaments)/hooks/useTournamentAdmin'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import { TournamentCategoryDto } from '@/app/(protected)/(tournaments)/models/TournamentCategoryDto'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { registersAsPairs } from '@/app/(protected)/(tournaments)/utils/discipline'
import Avatar from '@/app/components/Avatar'
import { UserDto } from '@/app/models/UserDto'
import { useUserStore } from '@/app/stores/users'

interface TournamentAdminViewProps {
  tournamentId: number
}

const DEFAULT_MAX_COMPETITORS = 16

/** Reusable player search autocomplete (platform players by name / email). */
function PlayerPicker({
  label,
  value,
  onChange,
  excludeIds
}: {
  label: string
  value: UserDto | null
  onChange: (value: UserDto | null) => void
  excludeIds: number[]
}) {
  const { getPlayers } = usePlayers()
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<UserDto[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const normalized = query.trim()

    if (normalized.length === 1) {
      setOptions([])

      return
    }

    setSearching(true)

    const timeout = setTimeout(
      async () => {
        const users = await getPlayers(normalized)

        setOptions(users.filter((user) => !excludeIds.includes(user.id)))
        setSearching(false)
      },
      normalized.length === 0 ? 0 : 350
    )

    return () => clearTimeout(timeout)
  }, [getPlayers, query, excludeIds])

  return (
    <Autocomplete
      options={options}
      value={value}
      loading={searching}
      onChange={(_, next) => onChange(next)}
      onInputChange={(_, next) => setQuery(next)}
      getOptionLabel={(option) => option.displayName}
      isOptionEqualToValue={(option, candidate) => option.id === candidate.id}
      filterOptions={(items) => items}
      noOptionsText={searching ? 'Buscando...' : 'No se encontraron jugadores'}
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <div className="admin-user-option">
            <Avatar email={option.email} name={option.displayName} size="sm" />
            <div>
              <div className="name">{option.displayName}</div>
              <div className="email">{option.email}</div>
            </div>
          </div>
        </li>
      )}
      renderInput={(params) => <TextField {...params} placeholder={label} size="small" />}
    />
  )
}

export default function TournamentAdminView({ tournamentId }: TournamentAdminViewProps) {
  const [tournament, setTournament] = useState<TournamentDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const { getTournament } = useTournaments()
  const { getCategories } = useCategories()
  const { addCategory, removeCategory, registerCompetitor, moveCompetitor, unregisterCompetitor } = useTournamentAdmin()
  const userId = useUserStore((state) => state.user?.id ?? null)
  // Add-category form.
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryMax, setNewCategoryMax] = useState<string>(String(DEFAULT_MAX_COMPETITORS))
  const [catalogueNames, setCatalogueNames] = useState<string[]>([])
  // Register-competitor modal.
  const [registerOpen, setRegisterOpen] = useState(false)
  const [registerCategoryId, setRegisterCategoryId] = useState<number | ''>('')
  const [player, setPlayer] = useState<UserDto | null>(null)
  const [partner, setPartner] = useState<UserDto | null>(null)
  // "Move to category" menu anchored to a competitor's chip.
  const [moveMenu, setMoveMenu] = useState<{ anchorEl: HTMLElement; competitor: CompetitorDto } | null>(null)
  // Generic confirmation dialog.
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => Promise<void> } | null>(null)
  const isOwner = tournament != null && userId != null && tournament.ownerId === userId
  const isStandBy = tournament?.status === TournamentStatus.STAND_BY
  const categories = useMemo<TournamentCategoryDto[]>(() => tournament?.categories ?? [], [tournament])
  const competitors = useMemo<CompetitorDto[]>(() => tournament?.competitors ?? [], [tournament])
  const isPaid = !!tournament?.paid && !!tournament?.entryFee && tournament.entryFee > 0
  const needsPartner = tournament
    ? registersAsPairs(tournament.discipline, tournament.subDiscipline, tournament.type)
    : false
  const competitorCountByCategory = useMemo(() => {
    const map = new Map<number, number>()

    for (const competitor of competitors) {
      map.set(competitor.tournamentCategoryId, (map.get(competitor.tournamentCategoryId) ?? 0) + 1)
    }

    return map
  }, [competitors])
  const registeredUserIds = useMemo(() => {
    const ids: number[] = []

    for (const competitor of competitors) {
      ids.push(...competitor.playerIds)
    }

    return ids
  }, [competitors])
  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.category?.name ?? 'Categoría única'])),
    [categories]
  )
  const loadTournament = useCallback(async () => {
    const data = await getTournament(tournamentId)

    setTournament(data)
    setLoading(false)
  }, [getTournament, tournamentId])

  useEffect(() => {
    loadTournament()
  }, [loadTournament])

  // Populate the category-name autocomplete from the organization catalogue for
  // this discipline / sub-discipline, excluding names already in the tournament.
  useEffect(() => {
    if (!tournament) {
      return
    }

    getCategories(tournament.discipline, tournament.subDiscipline)
      .then((list) => setCatalogueNames(list.map((category) => category.name)))
      .catch(() => setCatalogueNames([]))
  }, [getCategories, tournament])

  const runAction = async (action: () => Promise<void>): Promise<boolean> => {
    setWorking(true)

    try {
      await action()
    } catch {
      setWorking(false)

      return false
    }

    await loadTournament()
    setWorking(false)

    return true
  }

  if (loading) {
    return (
      <div className="tournament-admin">
        <Paper className="section">
          <Skeleton variant="text" width="40%" height={32} />
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={56} />
        </Paper>
      </div>
    )
  }

  if (!tournament || !isOwner || !isStandBy) {
    return (
      <div className="tournament-admin">
        <Alert
          severity="error"
          action={
            tournament ? (
              <Button color="inherit" size="small" component={Link} href={`/tournaments/${tournamentId}`}>
                Volver
              </Button>
            ) : undefined
          }
        >
          {tournament && !isStandBy
            ? 'La administración solo está disponible mientras el torneo está en fase de inscripción.'
            : 'Torneo no encontrado'}
        </Alert>
      </div>
    )
  }

  const availableCatalogueNames = catalogueNames.filter(
    (name) => !categories.some((category) => (category.category?.name ?? '').toLowerCase() === name.toLowerCase())
  )
  const effectiveRegisterCategoryId =
    categories.length === 1 ? categories[0].id : registerCategoryId === '' ? '' : Number(registerCategoryId)

  const handleAddCategory = async () => {
    const name = newCategoryName.trim()
    const max = Number(newCategoryMax)

    if (!name || !max || max < 2) {
      return
    }

    const ok = await runAction(() => addCategory(tournament.id, name, max))

    if (ok) {
      setNewCategoryName('')
      setNewCategoryMax(String(DEFAULT_MAX_COMPETITORS))
    }
  }

  const openRegister = () => {
    setRegisterCategoryId('')
    setPlayer(null)
    setPartner(null)
    setRegisterOpen(true)
  }

  const handleRegister = async () => {
    if (!player || effectiveRegisterCategoryId === '') {
      return
    }

    const ok = await runAction(() =>
      registerCompetitor(
        tournament.id,
        Number(effectiveRegisterCategoryId),
        needsPartner && partner ? [player.id, partner.id] : [player.id]
      )
    )

    if (ok) {
      setRegisterOpen(false)
    }
  }

  const handleMove = async (targetCategoryId: number) => {
    const competitor = moveMenu?.competitor

    setMoveMenu(null)

    if (!competitor || competitor.tournamentCategoryId === targetCategoryId) {
      return
    }

    await runAction(() => moveCompetitor(tournament.id, competitor.id, targetCategoryId))
  }

  const requestRemoveCategory = (category: TournamentCategoryDto) => {
    setConfirm({
      title: 'Quitar categoría',
      message: `¿Quitar la categoría "${categoryNameById.get(category.id)}"?`,
      action: () => removeCategory(tournament.id, category.id)
    })
  }

  const requestUnregister = (competitor: CompetitorDto) => {
    setConfirm({
      title: 'Desinscribir competidor',
      message: `¿Desinscribir a ${competitor.displayName}?`,
      action: () => unregisterCompetitor(tournament.id, competitor.id)
    })
  }

  const handleConfirm = async () => {
    if (!confirm) {
      return
    }

    const action = confirm.action

    setConfirm(null)
    await runAction(action)
  }

  const canRegister = !!player && effectiveRegisterCategoryId !== '' && (!needsPartner || !!partner)

  return (
    <div className="tournament-admin">
      <div className="admin-header">
        <Tooltip title="Volver">
          <IconButton component={Link} href={`/tournaments/${tournamentId}`} size="small">
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <div className="admin-header-titles">
          <Typography variant="h5" component="h1" className="admin-title">
            Administrar torneo
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {tournament.name}
          </Typography>
        </div>
      </div>

      <Paper className="section">
        <Typography variant="h6" className="section-title">
          Categorías
        </Typography>
        <div className="category-rows">
          {categories.map((category) => {
            const count = competitorCountByCategory.get(category.id) ?? 0
            const isLast = categories.length <= 1
            const blocked = count > 0 || isLast
            const reason = isLast
              ? 'El torneo debe tener al menos una categoría'
              : count > 0
                ? 'No se puede quitar una categoría con competidores inscriptos'
                : 'Quitar categoría'

            return (
              <div key={category.id} className="category-row">
                <div className="category-info">
                  <Typography className="category-name">{categoryNameById.get(category.id)}</Typography>
                  <Chip size="small" variant="outlined" label={`${count} / ${category.maxCompetitors}`} />
                </div>
                <Tooltip title={reason}>
                  <span>
                    <IconButton
                      color="error"
                      size="small"
                      disabled={blocked || working}
                      onClick={() => requestRemoveCategory(category)}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </div>
            )
          })}
        </div>
        <Divider />
        <div className="add-category">
          <Autocomplete
            freeSolo
            options={availableCatalogueNames}
            inputValue={newCategoryName}
            onInputChange={(_, value) => setNewCategoryName(value)}
            className="add-category-name"
            renderInput={(params) => <TextField {...params} label="Nueva categoría" size="small" />}
          />
          <TextField
            label="Cupo"
            type="number"
            size="small"
            value={newCategoryMax}
            onChange={(event) => setNewCategoryMax(event.target.value)}
            slotProps={{ htmlInput: { min: 2 } }}
            className="add-category-max"
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddCategory}
            disabled={working || !newCategoryName.trim() || Number(newCategoryMax) < 2}
          >
            Agregar
          </Button>
        </div>
      </Paper>

      <Paper className="section">
        <Typography variant="h6" className="section-title">
          Competidores
        </Typography>

        {isPaid ? (
          <Alert severity="info">
            Este es un torneo de pago: la inscripción de competidores se realiza a través del flujo de pago de Mercado
            Pago. Desde acá podés mover o desinscribir competidores.
          </Alert>
        ) : (
          <div className="register-actions">
            <Button variant="contained" startIcon={<PersonAddAlt1Icon />} onClick={openRegister} disabled={working}>
              Inscribir competidor
            </Button>
          </div>
        )}

        <Divider />

        {competitors.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Aún no hay competidores inscriptos
          </Typography>
        ) : (
          <div className="competitor-rows">
            {competitors.map((competitor) => (
              <div key={competitor.id} className="competitor-row">
                <Typography className="competitor-name">{competitor.displayName}</Typography>
                <div className="competitor-actions">
                  {categories.length > 1 && (
                    <Tooltip title="Cambiar de categoría">
                      <Chip
                        size="small"
                        variant="outlined"
                        clickable
                        disabled={working}
                        className="competitor-category-chip"
                        label={categoryNameById.get(competitor.tournamentCategoryId)}
                        deleteIcon={<KeyboardArrowDownIcon />}
                        onClick={(event) => setMoveMenu({ anchorEl: event.currentTarget, competitor })}
                        onDelete={(event) => setMoveMenu({ anchorEl: event.currentTarget, competitor })}
                      />
                    </Tooltip>
                  )}
                  <Tooltip title="Desinscribir">
                    <span>
                      <IconButton
                        color="error"
                        size="small"
                        disabled={working}
                        onClick={() => requestUnregister(competitor)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}
      </Paper>

      <Menu anchorEl={moveMenu?.anchorEl ?? null} open={!!moveMenu} onClose={() => setMoveMenu(null)}>
        {categories.map((category) => (
          <MenuItem
            key={category.id}
            selected={category.id === moveMenu?.competitor.tournamentCategoryId}
            onClick={() => handleMove(category.id)}
          >
            {categoryNameById.get(category.id)}
          </MenuItem>
        ))}
      </Menu>

      <Dialog open={registerOpen} onClose={() => setRegisterOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Inscribir competidor</DialogTitle>
        <DialogContent className="register-dialog-content">
          {categories.length > 1 && (
            <TextField
              select
              label="Categoría"
              size="small"
              fullWidth
              value={registerCategoryId === '' ? '' : String(registerCategoryId)}
              onChange={(event) => setRegisterCategoryId(Number(event.target.value))}
            >
              {categories.map((category) => (
                <MenuItem key={category.id} value={String(category.id)}>
                  {categoryNameById.get(category.id)}
                </MenuItem>
              ))}
            </TextField>
          )}
          <PlayerPicker label="Buscar jugador..." value={player} onChange={setPlayer} excludeIds={registeredUserIds} />
          {needsPartner && (
            <PlayerPicker
              label="Buscar compañero/a..."
              value={partner}
              onChange={setPartner}
              excludeIds={[...registeredUserIds, ...(player ? [player.id] : [])]}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegisterOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            startIcon={<PersonAddAlt1Icon />}
            onClick={handleRegister}
            disabled={working || !canRegister}
          >
            Inscribir
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)}>
        <DialogTitle>{confirm?.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{confirm?.message}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={handleConfirm}>
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
