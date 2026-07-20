import { TournamentImage } from '@/app/(protected)/(tournaments)/models/TournamentImage'

/**
 * Creates, updates or removes a tournament's poster picture row.
 *
 * @param image The already-validated base64 data URL (see `normalizeImage`),
 *   or null to clear the tournament's picture.
 */
export async function setTournamentImage(tournamentId: number, image: string | null): Promise<void> {
  const existing = await TournamentImage.where('tournamentId', tournamentId).first()

  if (!image) {
    if (existing) {
      await existing.delete()
    }

    return
  }

  const now = new Date()

  if (existing) {
    existing.image = image
    existing.updatedAt = now
    await existing.save()

    return
  }

  const record = new TournamentImage()

  record.tournamentId = tournamentId
  record.image = image
  record.createdAt = now
  record.updatedAt = now
  await record.save()
}
