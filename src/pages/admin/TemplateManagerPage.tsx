import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { pocketbaseService } from '../../services/mcpPocketbaseService'
import type { Dataset, TemplateProfileAssignment } from '../../types'
import Navigation from '../../components/Navigation'
import { useSession } from '../../context/SessionContext'

function composeProfile(companyCode: string, buCode: string, teamCode: string): string {
  if (!companyCode) return ''
  return `${companyCode}${buCode || '000'}${teamCode || '000'}`
}

function parseProfile(code: string | null): { company: string; bu: string; team: string } {
  if (!code || code.length !== 9) return { company: '', bu: '', team: '' }
  return {
    company: code.slice(0, 3).trim(),
    bu: code.slice(3, 6).trim() === '000' ? '' : code.slice(3, 6).trim(),
    team: code.slice(6, 9).trim() === '000' ? '' : code.slice(6, 9).trim(),
  }
}

interface DatasetRowProps {
  dataset: Dataset
  assignment: TemplateProfileAssignment | undefined
  onSave: (datasetId: string, profileCode: string | null) => Promise<void>
  isSaving: boolean
}

function DatasetRow({ dataset, assignment, onSave, isSaving }: DatasetRowProps) {
  const parsed = parseProfile(assignment?.profile_code ?? null)
  const [editing, setEditing] = useState(false)
  const [companyCode, setCompanyCode] = useState(parsed.company)
  const [buCode, setBuCode] = useState(parsed.bu)
  const [teamCode, setTeamCode] = useState(parsed.team)

  const { data: companies = [] } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: () => pocketbaseService.listCompanies(),
    enabled: editing,
  })
  const { data: bus = [] } = useQuery({
    queryKey: ['admin-bus', companyCode],
    queryFn: () => pocketbaseService.listBusinessUnits(companyCode),
    enabled: editing && !!companyCode,
  })
  const { data: teams = [] } = useQuery({
    queryKey: ['admin-teams', companyCode, buCode],
    queryFn: () => pocketbaseService.listTeams(companyCode, buCode),
    enabled: editing && !!companyCode && !!buCode,
  })

  const handleSave = async () => {
    const code = companyCode ? composeProfile(companyCode, buCode, teamCode) : null
    await onSave(dataset.id, code)
    setEditing(false)
  }

  const handleClear = async () => {
    await onSave(dataset.id, null)
    setCompanyCode('')
    setBuCode('')
    setTeamCode('')
    setEditing(false)
  }

  const currentCode = assignment?.profile_code ?? null

  return (
    <tr className="border-t border-gray-100 dark:border-gray-800">
      <td className="px-4 py-3">
        <div className="font-medium text-gray-800 dark:text-gray-200 text-sm">{dataset.name}</div>
        {dataset.description && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{dataset.description}</div>
        )}
      </td>
      <td className="px-4 py-3">
        {currentCode ? (
          <span className="font-mono text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded">
            {currentCode}
          </span>
        ) : (
          <span className="text-xs text-gray-400 italic">All users</span>
        )}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <div className="space-y-2 min-w-[280px]">
            <select
              className="input-field py-1 text-sm"
              value={companyCode}
              onChange={(e) => { setCompanyCode(e.target.value); setBuCode(''); setTeamCode('') }}
            >
              <option value="">— all users —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.code}>{c.name} ({c.code})</option>
              ))}
            </select>
            {companyCode && (
              <select
                className="input-field py-1 text-sm"
                value={buCode}
                onChange={(e) => { setBuCode(e.target.value); setTeamCode('') }}
              >
                <option value="">— any BU —</option>
                {bus.map((bu) => (
                  <option key={bu.id} value={bu.code}>{bu.name} ({bu.code})</option>
                ))}
              </select>
            )}
            {companyCode && buCode && (
              <select
                className="input-field py-1 text-sm"
                value={teamCode}
                onChange={(e) => setTeamCode(e.target.value)}
              >
                <option value="">— any team —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.code}>{t.name} ({t.code})</option>
                ))}
              </select>
            )}
            {companyCode && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Code: <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                  {composeProfile(companyCode, buCode, teamCode)}
                </span>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                className="btn-primary px-3 py-1 text-xs"
                disabled={isSaving}
                onClick={handleSave}
              >
                Save
              </button>
              <button
                className="btn-secondary px-3 py-1 text-xs"
                disabled={isSaving}
                onClick={handleClear}
              >
                Clear
              </button>
              <button
                className="btn-secondary px-3 py-1 text-xs"
                onClick={() => { setEditing(false); const p = parseProfile(currentCode); setCompanyCode(p.company); setBuCode(p.bu); setTeamCode(p.team) }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn-secondary px-3 py-1 text-xs"
            onClick={() => setEditing(true)}
          >
            Edit Profile
          </button>
        )}
      </td>
    </tr>
  )
}

export default function TemplateManagerPage() {
  const { session } = useSession()
  const qc = useQueryClient()

  const { data: datasets = [], isLoading: loadingDatasets } = useQuery({
    queryKey: ['datasets-all'],
    queryFn: () => pocketbaseService.getAllDatasets(),
    enabled: !!session?.email,
  })

  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ['admin-template-profiles'],
    queryFn: () => pocketbaseService.listTemplateProfiles(),
  })

  const saveMutation = useMutation({
    mutationFn: ({ datasetId, profileCode }: { datasetId: string; profileCode: string | null }) =>
      pocketbaseService.setTemplateProfile(datasetId, profileCode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-template-profiles'] })
      toast.success('Dataset profile updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleSave = async (datasetId: string, profileCode: string | null) => {
    await saveMutation.mutateAsync({ datasetId, profileCode })
  }

  const isLoading = loadingDatasets || loadingAssignments

  const assignmentMap = Object.fromEntries(assignments.map((a) => [a.template_id, a]))

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navigation />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Dataset Access Manager</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Assign a profile code to each dataset to restrict which users can access it.
          Datasets with no profile assigned are visible to all users.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : datasets.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">No datasets found.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Dataset</th>
                  <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium w-36">Profile</th>
                  <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium text-left">Assignment</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <DatasetRow
                    key={d.id}
                    dataset={d}
                    assignment={assignmentMap[d.id]}
                    onSave={handleSave}
                    isSaving={saveMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
