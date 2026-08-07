'use client'

import './index.scss'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import DriveFileMoveOutlinedIcon from '@mui/icons-material/DriveFileMoveOutlined'
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
import CategorySelector from '@/app/(protected)/(categories)/components/CategorySelector'
import SiteSelector from '@/app/(protected)/(sites)/components/SiteSelector'
import TeamRosterField, { RosterPlayer } from '@/app/(protected)/(tournaments)/components/TeamRosterField'
import { usePlayers } from '@/app/(protected)/(tournaments)/hooks/usePlayers'
import { useTournamentAdmin } from '@/app/(protected)/(tournaments)/hooks/useTournamentAdmin'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { CompetitorDto, CompetitorUserInfo } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { TournamentCategoryDto } from '@/app/(protected)/(tournaments)/models/TournamentCategoryDto'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { registersAsPairs, registersAsTeam } from '@/app/(protected)/(tournaments)/utils/discipline'
import { INTERCLUBS_MIN_TEAM_PLAYERS } from '@/app/(protected)/(tournaments)/utils/interclubs'
import { getLateRegistrationSlots, LateRegistrationSlot } from '@/app/(protected)/(tournaments)/utils/lateRegistration'
import { supportsPreclassification } from '@/app/(protected)/(tournaments)/utils/preclassification'
import Avatar from '@/app/components/Avatar'
import { UserDto } from '@/app/models/UserDto'
import { useUserStore } from '@/app/stores/users'

interface TournamentAdminViewProps {
  tournamentId: number
}

const DEFAULT_MAX_COMPETITORS = 16

/**
 * Reusable player search autocomplete (platform players by name / email), scoped to a
 * tournament: the server excludes players already registered as competitors in it, so
 * `excludeIds` here is only for extra local exclusions (e.g. hiding the main entrant
 * while picking their pair partner in the same form).
 */
function PlayerPicker({
  label,
  value,
  onChange,
  tournamentId,
  excludeIds
}: {
  label: string
  value: UserDto | null
  onChange: (value: UserDto | null) => void
  tournamentId: number
  excludeIds: number[]
}) {
  const { getPlayersForJoin } = usePlayers()
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
        const users = await getPlayersForJoin(tournamentId, normalized, excludeIds)

        setOptions(users)
        setSearching(false)
      },
      normalized.length === 0 ? 0 : 350
    )

    return () => clearTimeout(timeout)
  }, [getPlayersForJoin, tournamentId, query, excludeIds])

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

/** One (singles) or two (pairs) overlapping avatars for a competitor row/card. */
function CompetitorAvatarGroup({ players, fallbackName }: { players?: CompetitorUserInfo[]; fallbackName: string }) {
  if (!players || players.length === 0) {
    return <Avatar email="" name={fallbackName} size="sm" />
  }

  return (
    <div className="competitor-avatar-group">
      {players.slice(0, 2).map((player, index) => (
        <Avatar
          key={index}
          className="competitor-avatar-group-item"
          size="sm"
          email={player.email}
          name={player.displayName}
        />
      ))}
    </div>
  )
}

export default function TournamentAdminView({ tournamentId }: TournamentAdminViewProps) {
  const [tournament, setTournament] = useState<TournamentDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const { getTournament } = useTournaments()
  const { addCategory, removeCategory, registerCompetitor, moveCompetitor, unregisterCompetitor, setCompetitorSeed } =
    useTournamentAdmin()
  const userId = useUserStore((state) => state.user?.id ?? null)
  // Add-category form.
  const [newCategoryId, setNewCategoryId] = useState<number | null>(null)
  const [newCategoryMax, setNewCategoryMax] = useState<string>(String(DEFAULT_MAX_COMPETITORS))
  // Register-competitor modal.
  const [registerOpen, setRegisterOpen] = useState(false)
  const [registerCategoryId, setRegisterCategoryId] = useState<number | ''>('')
  const [player, setPlayer] = useState<UserDto | null>(null)
  const [partner, setPartner] = useState<UserDto | null>(null)
  // Interclubes only: venue of the team and its members beyond the captain
  // (`player` above, who always heads the roster).
  const [registerSiteId, setRegisterSiteId] = useState<number | null>(null)
  const [teamMates, setTeamMates] = useState<RosterPlayer[]>([])
  // Late registration only: which structural hole the entrant takes.
  const [registerSlotKey, setRegisterSlotKey] = useState<string>('')
  // "Move to category" menu anchored to a competitor's chip.
  const [moveMenu, setMoveMenu] = useState<{ anchorEl: HTMLElement; competitor: CompetitorDto } | null>(null)
  // Generic confirmation dialog.
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => Promise<void> } | null>(null)
  const isOwner = tournament != null && userId != null && tournament.ownerId === userId
  const isStandBy = tournament?.status === TournamentStatus.STAND_BY
  // A running tournament turns this page into a registration-only view: its
  // structure is being played, so categories, seeds, moves and unregistrations
  // are all off the table. All that is left is slotting an entrant into a hole
  // the structure already has (see utils/lateRegistration).
  const isOngoing = tournament?.status === TournamentStatus.ONGOING
  const categories = useMemo<TournamentCategoryDto[]>(() => tournament?.categories ?? [], [tournament])
  const competitors = useMemo<CompetitorDto[]>(() => tournament?.competitors ?? [], [tournament])
  const matches = useMemo<MatchDto[]>(() => tournament?.matches ?? [], [tournament])
  /** Where a late entrant fits, per category id. Empty for a tournament that has not started. */
  const slotsByCategory = useMemo(() => {
    const map = new Map<number, LateRegistrationSlot[]>()

    if (!tournament || !isOngoing) {
      return map
    }

    for (const category of categories) {
      map.set(category.id, getLateRegistrationSlots(tournament, category, matches, competitors))
    }

    return map
  }, [tournament, isOngoing, categories, matches, competitors])
  /** Categories that can still take an entrant — every one of them while in registration. */
  const registrableCategories = useMemo(
    () =>
      isOngoing ? categories.filter((category) => (slotsByCategory.get(category.id) ?? []).length > 0) : categories,
    [isOngoing, categories, slotsByCategory]
  )
  const needsPartner = tournament
    ? registersAsPairs(tournament.discipline, tournament.subDiscipline, tournament.type)
    : false
  const isTeam = tournament ? registersAsTeam(tournament.type) : false
  // Seeding only makes sense for bracket-style tournaments (see
  // supportsPreclassification); the manual seed set here takes priority over
  // the ranking-based auto-assignment that runs when the tournament starts.
  const seedingEnabled = tournament ? supportsPreclassification(tournament.type) : false
  const competitorCountByCategory = useMemo(() => {
    const map = new Map<number, number>()

    for (const competitor of competitors) {
      map.set(competitor.tournamentCategoryId, (map.get(competitor.tournamentCategoryId) ?? 0) + 1)
    }

    return map
  }, [competitors])
  // Grouped by category (in category order) so the competitors section can
  // show one compact card grid per category instead of a redundant category
  // label repeated on every single row.
  const competitorsByCategory = useMemo(
    () =>
      categories.map((category) => ({
        category,
        competitors: competitors.filter((competitor) => competitor.tournamentCategoryId === category.id)
      })),
    [categories, competitors]
  )
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

  if (!tournament || !isOwner || (!isStandBy && !isOngoing)) {
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
          {tournament && !isStandBy && !isOngoing
            ? 'La administración no está disponible en un torneo finalizado.'
            : 'Torneo no encontrado'}
        </Alert>
      </div>
    )
  }

  // Categories already materialised in the tournament are not offered again.
  const usedCategoryIds = categories
    .map((category) => category.categoryId)
    .filter((categoryId): categoryId is number => categoryId != null)
  // A multi-category tournament always asks which category, even while running
  // and even when only one of them can take an entrant: the organizer has to see
  // WHICH one they are registering into. Only a single-category tournament
  // resolves it implicitly, because there is nothing to choose.
  const effectiveRegisterCategoryId =
    categories.length === 1 ? categories[0].id : registerCategoryId === '' ? '' : Number(registerCategoryId)
  const availableSlots =
    effectiveRegisterCategoryId === '' ? [] : (slotsByCategory.get(Number(effectiveRegisterCategoryId)) ?? [])
  const slotKeyOf = (slot: LateRegistrationSlot) => `${slot.kind}:${slot.matchId ?? slot.groupNumber}`
  // With a single hole there is nothing to choose: it is taken implicitly.
  const effectiveSlot =
    availableSlots.length === 1
      ? availableSlots[0]
      : (availableSlots.find((slot) => slotKeyOf(slot) === registerSlotKey) ?? null)
  const canRegisterInOngoing = !isOngoing || effectiveSlot != null

  const handleAddCategory = async () => {
    const max = Number(newCategoryMax)

    if (!newCategoryId || !max || max < 2) {
      return
    }

    const ok = await runAction(() => addCategory(tournament.id, newCategoryId, max))

    if (ok) {
      setNewCategoryId(null)
      setNewCategoryMax(String(DEFAULT_MAX_COMPETITORS))
    }
  }

  const openRegister = () => {
    // When exactly one category is open, preselect it — the selector still shows
    // (so the choice is visible and can be changed) but the common case is one click.
    setRegisterCategoryId(registrableCategories.length === 1 ? registrableCategories[0].id : '')
    setRegisterSlotKey('')
    setPlayer(null)
    setPartner(null)
    setRegisterSiteId(null)
    setTeamMates([])
    setRegisterOpen(true)
  }

  const handleRegister = async () => {
    if (!player || effectiveRegisterCategoryId === '' || !canRegisterInOngoing) {
      return
    }

    const playerIds = isTeam
      ? [player.id, ...teamMates.map((mate) => mate.id)]
      : needsPartner && partner
        ? [player.id, partner.id]
        : [player.id]
    const ok = await runAction(() =>
      registerCompetitor(
        tournament.id,
        Number(effectiveRegisterCategoryId),
        playerIds,
        isTeam ? registerSiteId : null,
        effectiveSlot ? { matchId: effectiveSlot.matchId, groupNumber: effectiveSlot.groupNumber } : null
      )
    )

    if (ok) {
      setRegisterOpen(false)
    }
  }

  const handleSeedChange = async (competitor: CompetitorDto, rawValue: string) => {
    const trimmed = rawValue.trim()
    const nextSeed = trimmed === '' ? null : Number(trimmed)

    if (nextSeed === competitor.seedNumber) {
      return
    }

    if (nextSeed != null && (!Number.isInteger(nextSeed) || nextSeed < 1)) {
      return
    }

    await runAction(() => setCompetitorSeed(tournament.id, competitor.id, nextSeed))
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

  const teamSize = player ? teamMates.length + 1 : 0
  const canRegister =
    !!player &&
    effectiveRegisterCategoryId !== '' &&
    canRegisterInOngoing &&
    (!needsPartner || !!partner) &&
    (!isTeam || (registerSiteId != null && teamSize >= INTERCLUBS_MIN_TEAM_PLAYERS))
  /**
   * A single competitor "card": avatar(s), name and — while the tournament has
   * not started — the seed/move/unregister actions. Once it is running the card
   * is read-only: every one of those actions would change a structure that is
   * already being played.
   */
  const renderCompetitorCard = (competitor: CompetitorDto) => (
    <div key={competitor.id} className="competitor-card">
      <CompetitorAvatarGroup players={competitor.players} fallbackName={competitor.displayName} />
      <Tooltip title={competitor.displayName}>
        <Typography className="competitor-name">{competitor.displayName}</Typography>
      </Tooltip>
      <div className="competitor-card-actions">
        {seedingEnabled && !isOngoing && (
          <Tooltip title="Seed manual: tiene prioridad sobre el ranking al iniciar el torneo">
            <TextField
              key={`seed-${competitor.id}-${competitor.seedNumber ?? ''}`}
              label="#"
              size="small"
              type="number"
              className="competitor-seed-input"
              disabled={working}
              defaultValue={competitor.seedNumber ?? ''}
              slotProps={{ htmlInput: { min: 1 } }}
              onBlur={(event) => handleSeedChange(competitor, event.target.value)}
            />
          </Tooltip>
        )}
        {categories.length > 1 && !isOngoing && (
          <Tooltip title="Cambiar de categoría">
            <span>
              <IconButton
                size="small"
                disabled={working}
                onClick={(event) => setMoveMenu({ anchorEl: event.currentTarget, competitor })}
              >
                <DriveFileMoveOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        {!isOngoing && (
          <Tooltip title="Desinscribir">
            <span>
              <IconButton color="error" size="small" disabled={working} onClick={() => requestUnregister(competitor)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  )

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

      {/* Categories are the shape of the tournament: adding or removing one after
          it started would rebuild everything, so the whole panel is gone. */}
      {!isOngoing && (
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
            <CategorySelector
              value={newCategoryId}
              onChange={setNewCategoryId}
              discipline={tournament.discipline}
              excludedIds={usedCategoryIds}
              label="Nueva categoría"
              size="small"
              fullWidth={false}
              className="add-category-name"
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
              disabled={working || !newCategoryId || Number(newCategoryMax) < 2}
            >
              Agregar
            </Button>
          </div>
        </Paper>
      )}

      <Paper className="section">
        <div className="section-header-row">
          <Typography variant="h6" className="section-title">
            Competidores
          </Typography>
          {competitors.length > 0 && (
            <Chip
              size="small"
              variant="outlined"
              label={`${competitors.length} inscripto${competitors.length === 1 ? '' : 's'}`}
            />
          )}
        </div>
        {isOngoing && (
          <Alert severity={registrableCategories.length > 0 ? 'info' : 'warning'}>
            {registrableCategories.length > 0
              ? 'El torneo ya inició: solo se pueden inscribir competidores donde la estructura ya tiene lugar, sin cambiar ningún partido ya armado. No se pueden quitar ni mover competidores.'
              : 'El torneo ya inició y su estructura no admite nuevas inscripciones: inscribir a alguien cambiaría partidos que ya se están jugando.'}
          </Alert>
        )}
        <div className="register-actions">
          <Button
            variant="contained"
            startIcon={<PersonAddAlt1Icon />}
            onClick={openRegister}
            disabled={working || (isOngoing && registrableCategories.length === 0)}
          >
            Inscribir competidor
          </Button>
        </div>

        <Divider />

        {competitors.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Aún no hay competidores inscriptos
          </Typography>
        ) : categories.length > 1 ? (
          <div className="competitor-groups">
            {competitorsByCategory.map(({ category, competitors: categoryCompetitors }) => (
              <div key={category.id} className="competitor-group">
                <div className="competitor-group-header">
                  <Typography variant="subtitle2" className="competitor-group-title">
                    {categoryNameById.get(category.id)}
                  </Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${categoryCompetitors.length} / ${category.maxCompetitors}`}
                  />
                </div>
                {categoryCompetitors.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Sin competidores en esta categoría
                  </Typography>
                ) : (
                  <div className="competitor-cards">{categoryCompetitors.map(renderCompetitorCard)}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="competitor-cards">{competitors.map(renderCompetitorCard)}</div>
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
        <DialogTitle>{isTeam ? 'Inscribir equipo' : 'Inscribir competidor'}</DialogTitle>
        <DialogContent className="register-dialog-content">
          {/* Every category is listed, running or not. A closed one is shown
              disabled rather than hidden: the organizer needs to see that the
              category exists and why it cannot take anybody, instead of finding
              a shorter list than the tournament has. */}
          {categories.length > 1 && (
            <TextField
              select
              label="Categoría"
              size="small"
              fullWidth
              value={registerCategoryId === '' ? '' : String(registerCategoryId)}
              onChange={(event) => {
                setRegisterCategoryId(Number(event.target.value))
                setRegisterSlotKey('')
              }}
            >
              {categories.map((category) => {
                const categorySlots = slotsByCategory.get(category.id) ?? []
                const closed = isOngoing && categorySlots.length === 0

                return (
                  <MenuItem key={category.id} value={String(category.id)} disabled={closed}>
                    {categoryNameById.get(category.id)}
                    {closed ? ' — sin lugar en la estructura' : ''}
                  </MenuItem>
                )
              })}
            </TextField>
          )}
          {/* More than one hole in the structure: the organizer says which one.
              With exactly one there is nothing to pick, so it is taken silently. */}
          {isOngoing && availableSlots.length > 1 && (
            <TextField
              select
              label="Posición disponible"
              size="small"
              fullWidth
              value={registerSlotKey}
              onChange={(event) => setRegisterSlotKey(event.target.value)}
            >
              {availableSlots.map((slot) => (
                <MenuItem key={slotKeyOf(slot)} value={slotKeyOf(slot)}>
                  {slot.label}
                </MenuItem>
              ))}
            </TextField>
          )}
          {isOngoing && effectiveRegisterCategoryId !== '' && availableSlots.length === 0 && (
            <Alert severity="warning">Esta categoría no tiene lugar en su estructura para un nuevo competidor.</Alert>
          )}
          {isOngoing && effectiveSlot != null && availableSlots.length === 1 && (
            <Alert severity="info">Se inscribirá en: {effectiveSlot.label}</Alert>
          )}
          {isTeam && (
            <SiteSelector value={registerSiteId} onChange={setRegisterSiteId} label="Sede" required size="small" />
          )}
          <PlayerPicker
            label={isTeam ? 'Buscar capitán...' : 'Buscar jugador...'}
            value={player}
            onChange={setPlayer}
            tournamentId={tournament.id}
            excludeIds={teamMates.map((mate) => mate.id)}
          />
          {needsPartner && (
            <PlayerPicker
              label="Buscar compañero/a..."
              value={partner}
              onChange={setPartner}
              tournamentId={tournament.id}
              excludeIds={player ? [player.id] : []}
            />
          )}
          {isTeam && (
            <TeamRosterField
              tournamentId={tournament.id}
              captain={player}
              value={teamMates}
              onChange={setTeamMates}
              disabled={!player}
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
