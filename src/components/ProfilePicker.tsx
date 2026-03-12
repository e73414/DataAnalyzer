import { useQuery } from '@tanstack/react-query'
import { pocketbaseService } from '../services/mcpPocketbaseService'

export function composeProfile(companyCode: string, buCode: string, teamCode: string): string {
  return `${companyCode}${buCode || '000'}${teamCode || '000'}`
}

export interface ProfilePickerProps {
  companyCode: string
  buCode: string
  teamCode: string
  onChange: (companyCode: string, buCode: string, teamCode: string) => void
}

export function ProfilePicker({ companyCode, buCode, teamCode, onChange }: ProfilePickerProps) {
  const { data: companies = [] } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: () => pocketbaseService.listCompanies(),
  })
  const { data: bus = [] } = useQuery({
    queryKey: ['admin-bus', companyCode],
    queryFn: () => pocketbaseService.listBusinessUnits(companyCode),
    enabled: !!companyCode,
  })
  const { data: teams = [] } = useQuery({
    queryKey: ['admin-teams', companyCode, buCode],
    queryFn: () => pocketbaseService.listTeams(companyCode, buCode),
    enabled: !!companyCode && !!buCode,
  })

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Company</label>
        <select
          className="input-field"
          value={companyCode}
          onChange={(e) => onChange(e.target.value, '', '')}
        >
          <option value="">— select company —</option>
          {companies.map((c) => (
            <option key={c.id} value={c.code}>{c.name} ({c.code})</option>
          ))}
        </select>
      </div>
      {companyCode && (
        <div>
          <label className="label">Business Unit <span className="text-gray-400">(optional)</span></label>
          <select
            className="input-field"
            value={buCode}
            onChange={(e) => onChange(companyCode, e.target.value, '')}
          >
            <option value="">— none —</option>
            {bus.map((bu) => (
              <option key={bu.id} value={bu.code}>{bu.name} ({bu.code})</option>
            ))}
          </select>
        </div>
      )}
      {companyCode && buCode && (
        <div>
          <label className="label">Team <span className="text-gray-400">(optional)</span></label>
          <select
            className="input-field"
            value={teamCode}
            onChange={(e) => onChange(companyCode, buCode, e.target.value)}
          >
            <option value="">— none —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.code}>{t.name} ({t.code})</option>
            ))}
          </select>
        </div>
      )}
      {companyCode && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span>Profile code:</span>
          <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
            {composeProfile(companyCode, buCode, teamCode)}
          </span>
        </div>
      )}
    </div>
  )
}
