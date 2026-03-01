import { useQuery } from '@tanstack/react-query'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import { useSession } from '../context/SessionContext'
import type { Dataset } from '../types'

/**
 * Returns true if a user with the given profile can access a dataset
 * restricted to the given profile code.
 *
 * Profile codes are 9 chars: company(3) + bu(3) + team(3).
 * '000' in the BU or team position means "any".
 * No profile_code on the dataset means accessible to all users.
 * Admin profile 'admadmadm' bypasses all restrictions.
 */
export function canAccessDataset(userProfile: string | undefined, datasetProfileCode: string | null): boolean {
  if (!datasetProfileCode) return true
  if (!userProfile) return false
  if (userProfile === 'admadmadm') return true

  const dCompany = datasetProfileCode.slice(0, 3)
  const dBu = datasetProfileCode.slice(3, 6)
  const dTeam = datasetProfileCode.slice(6, 9)

  const uCompany = userProfile.slice(0, 3)
  const uBu = userProfile.slice(3, 6)
  const uTeam = userProfile.slice(6, 9)

  if (dCompany !== uCompany) return false
  if (dBu !== '000' && dBu !== uBu) return false
  if (dTeam !== '000' && dTeam !== uTeam) return false
  return true
}

/**
 * Fetches datasets for the current user and filters them based on
 * the profile assignments in the template_profiles table.
 */
export function useAccessibleDatasets(): {
  datasets: Dataset[]
  isLoading: boolean
  error: Error | null
} {
  const { session } = useSession()
  const userProfile = session?.profile

  const { data: allDatasets = [], isLoading: loadingDatasets, error: datasetsError } = useQuery({
    queryKey: ['datasets', session?.email],
    queryFn: () => pocketbaseService.getDatasetsByEmail(session!.email),
    enabled: !!session?.email,
  })

  const { data: assignments = [], isLoading: loadingAssignments, error: assignmentsError } = useQuery({
    queryKey: ['dataset-profiles'],
    queryFn: () => pocketbaseService.listTemplateProfiles(),
    enabled: !!session?.email,
  })

  const profileMap = Object.fromEntries(assignments.map((a) => [a.template_id, a.profile_code]))

  const datasets = allDatasets.filter((d) =>
    canAccessDataset(userProfile, profileMap[d.id] ?? null)
  )

  return {
    datasets,
    isLoading: loadingDatasets || loadingAssignments,
    error: (datasetsError || assignmentsError) as Error | null,
  }
}
