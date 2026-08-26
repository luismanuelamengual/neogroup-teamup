'use client'

import { useCallback } from 'react'
import { SiteData } from '@/app/(protected)/(sites)/models/SiteData'
import { SiteDto } from '@/app/(protected)/(sites)/models/SiteDto'
import { SiteFilters } from '@/app/(protected)/(sites)/models/SiteFilters'
import { SiteInput } from '@/app/(protected)/(sites)/models/SiteInput'
import { useRequests } from '@/app/hooks/useRequests'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'

/**
 * Page size used by `getAllSites`. The sites of an organization are a handful
 * of venues, so a single request always covers the whole catalogue.
 */
const ALL_SITES_PAGE_SIZE = 500

/** Client access to the site endpoints (listing is open to every signed-in user). */
export function useSites() {
  const executeRequest = useRequests()
  const getSites = useCallback(
    ({ query = '', page = 1, pageSize = 10 }: SiteFilters = {}): Promise<PaginatedResponse<SiteDto[]>> =>
      executeRequest<PaginatedResponse<SiteDto[]>>('/getSites', { query, page, pageSize }),
    [executeRequest]
  )
  /** Every site of the organization, ordered by name — what the SiteSelector needs. */
  const getAllSites = useCallback(
    async (): Promise<SiteDto[]> => (await getSites({ pageSize: ALL_SITES_PAGE_SIZE })).data,
    [getSites]
  )
  const createSite = useCallback(
    (input: SiteInput): Promise<{ id: number }> => executeRequest<{ id: number }>('/createSite', input),
    [executeRequest]
  )
  const updateSite = useCallback(
    (id: number, input: SiteInput): Promise<void> => executeRequest('/updateSite', { id, ...input }),
    [executeRequest]
  )
  const deleteSite = useCallback((id: number): Promise<void> => executeRequest('/deleteSite', { id }), [executeRequest])
  /**
   * Stores a venue's courts setup. Organizer-writable (the planner calls it on
   * every change), unlike the rest of the site endpoints.
   */
  const updateSiteData = useCallback(
    (id: number, data: SiteData | null): Promise<void> => executeRequest('/updateSiteData', { id, data }),
    [executeRequest]
  )

  return { getSites, getAllSites, createSite, updateSite, deleteSite, updateSiteData }
}
