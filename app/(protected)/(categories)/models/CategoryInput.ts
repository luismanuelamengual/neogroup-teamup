import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'

/**
 * Payload used by the administrator to create or edit a category of its
 * organization. A category is a division of a discipline ("Primera", "4ta") —
 * it carries no modality, see migration 010.
 */
export interface CategoryInput {
  name: string
  discipline: Discipline
}
