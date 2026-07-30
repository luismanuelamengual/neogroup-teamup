import dayjs from 'dayjs'

/**
 * Whether a tournament's registration window has opened, from the browser's
 * local date (no organization-timezone precision — that's the server's job,
 * see the same-named check in
 * app/(protected)/(tournaments)/services/registrations.ts, backed by
 * `isRegistrationOpen` in app/(protected)/(tournaments)/utils/tournaments.ts).
 * Used to drive client-only UI: hiding "Inscribirme" and swapping the STAND_BY
 * status chip between "Nuevo" and "Inscripción abierta".
 *
 * Null/undefined `startInscriptionsDate` means registrations are open since
 * the tournament was created.
 */
export function isRegistrationOpen(startInscriptionsDate: string | null | undefined): boolean {
  return !startInscriptionsDate || startInscriptionsDate <= dayjs().format('YYYY-MM-DD')
}
