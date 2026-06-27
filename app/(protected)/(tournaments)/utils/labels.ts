/** Etiquetas en español para los enums del dominio de torneos. */

export const DISCIPLINE_LABELS: Record<string, string> = {
  padel: 'Pádel',
  tennis: 'Tenis'
}

export const SUB_DISCIPLINE_LABELS: Record<string, string> = {
  singles: 'Singles',
  doubles: 'Dobles'
}

export const TOURNAMENT_TYPE_LABELS: Record<string, string> = {
  league: 'Liga',
  americano: 'Americana',
  americano_with_swap: 'Americana con intercambio de pareja',
  playoff: 'Eliminatoria',
  playoff_with_consolation: 'Eliminatoria con cuadro consuelo',
  groups_playoff: 'Grupos + Eliminatoria'
}

export const SCORE_FORMAT_LABELS: Record<string, string> = {
  three_sets: '3 sets',
  two_sets_super_tiebreak: '2 sets + Super tiebreak',
  basic_count: 'Contador básico'
}

export const TOURNAMENT_STATUS_LABELS: Record<string, string> = {
  stand_by: 'Inscripción abierta',
  ongoing: 'En juego',
  finished: 'Finalizado'
}

export const ORGANIZER_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'No tenés permisos para esta acción',
  notFound: 'Torneo no encontrado',
  invalidStatus: 'El torneo no está en un estado válido para esta acción',
  pendingMatches: 'Hay partidos sin resultado en la ronda actual',
  roundStillOpen: 'La ronda actual sigue abierta',
  noMoreRounds: 'No quedan rondas por jugar',
  notEnoughCompetitors: 'Se necesitan al menos 2 competidores',
  americanoOnlyPadel: 'La americana solo está disponible para pádel',
  invalidGroupsSettings:
    'La configuración de grupos no es válida (los que pasan deben ser menos que los competidores por grupo)',
  invalidScore: 'El resultado no es válido',
  roundClosed: 'La ronda ya fue cerrada',
  noMatchesGenerated: 'No se pudieron generar los partidos',
  missingFields: 'Completá todos los campos obligatorios',
  invalidTime: 'La hora debe tener el formato HH:mm'
}

export const PLAYER_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Tenés que iniciar sesión',
  notFound: 'Torneo no encontrado',
  registrationClosed: 'La inscripción está cerrada',
  tournamentFull: 'El torneo ya está completo',
  alreadyRegistered: 'Ya estás inscripto en este torneo',
  partnerRequired: 'Tenés que indicar un compañero/a',
  partnerNotFound: 'No se encontró el usuario seleccionado',
  categoryRequired: 'Tenés que elegir una categoría',
  invalidCategory: 'La categoría seleccionada no es válida',
  notRegistered: 'No estás inscripto en este torneo',
  invalidStatus: 'El torneo no está en un estado válido para esta acción',
  invalidScore: 'El resultado no es válido',
  roundClosed: 'La ronda ya fue cerrada'
}
