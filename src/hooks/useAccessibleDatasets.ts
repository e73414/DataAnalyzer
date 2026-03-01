import { useQuery } from '@tanstack/react-query'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import { useSession } from '../context/SessionContext'
import type { Dataset } from '../types'

/**
 * Returns true if a user can access a dataset.
 *
 * Rules:
 * - Admin (admadmadm) sees everything.
 * - Dataset WITH a profile_code: user's profile must match hierarchically.
 *   Profile codes are 9 chars: company(3) + bu(3) + team(3).
 *   '000' in the dataset's BU or team position means "any".
 * - Dataset with NO profile_code: only the owner (owner_email) can see it.
 */
export function canAccessDataset(
  userProfile: string | undefined,
  userEmail: string | undefined,
  datasetProfileCode: string | null | undefined,
  datasetOwnerEmail: string,
): boolean {
  if (userProfile?.trim() === 'admadmadm') return true

  // No profile assigned → owner-only
  const code = datasetProfileCode?.trim() || null
  if (!code) return userEmail === datasetOwnerEmail

  // Profile assigned → must match
  if (!userProfile) return false

  const dCompany = code.slice(0, 3).trim()
  const dBu      = code.slice(3, 6).trim()
  const dTeam    = code.slice(6, 9).trim()

  const uCompany = userProfile.slice(0, 3).trim()
  const uBu      = userProfile.slice(3, 6).trim()
  const uTeam    = userProfile.slice(6, 9).trim()

  if (dCompany !== uCompany) return false
  if (dBu !== '000' && dBu !== uBu) return false
  if (dTeam !== '000' && dTeam !== uTeam) return false
  return true
}

/**
 * Fetches datasets the current user is permitted to access.
 * Filtering is done server-side in postgres.
 */
export function useAccessibleDatasets(): {
  datasets: Dataset[]
  isLoading: boolean
  error: Error | null
} {
  const { session } = useSession()

  const { data: datasets = [], isLoading, error } = useQuery({
    queryKey: ['datasets', session?.email, session?.profile],
    queryFn: () => pocketbaseService.getAccessibleDatasets(session!.email, session?.profile),
    enabled: !!session?.email,
  })

  return {
    datasets,
    isLoading,
    error: error as Error | null,
  }
}
