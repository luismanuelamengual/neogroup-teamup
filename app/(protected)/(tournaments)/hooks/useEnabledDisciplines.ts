import { Discipline, Disciplines } from '@/app/(protected)/(tournaments)/models/Discipline'
import { useOrganizationStore } from '@/app/stores/organization'

// Stable reference for the "not hydrated yet" fallback. A literal `?? []`
// inline in the selector would create a new array on every call, which makes
// useSyncExternalStore treat the snapshot as always-changing (the "result of
// getServerSnapshot should be cached" warning/loop) — even though nothing in
// the store actually changed.
const NO_DISCIPLINES: Discipline[] = []

/**
 * Disciplines enabled for the current organization, in catalogue order.
 * Every screen that lists disciplines (category and tournament forms, ranking
 * filters) should map over this instead of the full `Disciplines` catalogue.
 */
export function useEnabledDisciplines(): Discipline[] {
  const enabledDisciplines = useOrganizationStore((state) => state.organization?.enabledDisciplines ?? NO_DISCIPLINES)

  return Disciplines.filter((discipline) => enabledDisciplines.includes(discipline))
}
