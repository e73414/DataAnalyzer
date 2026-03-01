import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { pocketbaseService } from '../../services/mcpPocketbaseService'
import type { ProfileCompany, ProfileBusinessUnit, ProfileTeam } from '../../types'
import Navigation from '../../components/Navigation'

type Tab = 'companies' | 'business-units' | 'teams'

function CodeBadge({ code }: { code: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
      {code}
    </span>
  )
}

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
        <p className="text-gray-800 dark:text-gray-200 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="btn-secondary px-4">Cancel</button>
          <button onClick={onConfirm} className="btn-danger px-4">Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── Companies Tab ─────────────────────────────────────────────────────────────

function CompaniesTab() {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<ProfileCompany | null>(null)

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: () => pocketbaseService.listCompanies(),
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => pocketbaseService.createCompany(name),
    onSuccess: (company) => {
      qc.invalidateQueries({ queryKey: ['admin-companies'] })
      toast.success(`Company created with code: ${company.code}`)
      setNewName('')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => pocketbaseService.updateCompany(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-companies'] })
      toast.success('Company updated')
      setEditId(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pocketbaseService.deleteCompany(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-companies'] })
      toast.success('Company deleted')
      setConfirmDelete(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div>
      <div className="flex items-end gap-3 mb-6">
        <div className="flex-1 max-w-xs">
          <label className="label">New Company Name</label>
          <input
            className="input-field"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && newName.trim() && createMutation.mutate(newName.trim())}
            placeholder="e.g. Acme Corp"
          />
        </div>
        <button
          className="btn-primary px-4"
          disabled={!newName.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate(newName.trim())}
        >
          Add Company
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : companies.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm py-4">No companies yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 pr-4 text-gray-500 dark:text-gray-400 font-medium w-24">Code</th>
              <th className="text-left py-2 pr-4 text-gray-500 dark:text-gray-400 font-medium">Name</th>
              <th className="py-2 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-2 pr-4"><CodeBadge code={c.code} /></td>
                <td className="py-2 pr-4">
                  {editId === c.id ? (
                    <input
                      className="input-field py-1"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') updateMutation.mutate({ id: c.id, name: editName.trim() })
                        if (e.key === 'Escape') setEditId(null)
                      }}
                      autoFocus
                    />
                  ) : (
                    <span className="text-gray-800 dark:text-gray-200">{c.name}</span>
                  )}
                </td>
                <td className="py-2">
                  <div className="flex gap-2 justify-end">
                    {editId === c.id ? (
                      <>
                        <button
                          className="btn-primary px-3 py-1 text-xs"
                          disabled={updateMutation.isPending}
                          onClick={() => updateMutation.mutate({ id: c.id, name: editName.trim() })}
                        >
                          Save
                        </button>
                        <button className="btn-secondary px-3 py-1 text-xs" onClick={() => setEditId(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn-secondary px-3 py-1 text-xs"
                          onClick={() => { setEditId(c.id); setEditName(c.name) }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-danger px-3 py-1 text-xs"
                          onClick={() => setConfirmDelete(c)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={`Delete company "${confirmDelete.name}" (${confirmDelete.code})? This will also delete all associated BUs and Teams.`}
          onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

// ── Business Units Tab ────────────────────────────────────────────────────────

function BusinessUnitsTab() {
  const qc = useQueryClient()
  const [selectedCompany, setSelectedCompany] = useState<ProfileCompany | null>(null)
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<ProfileBusinessUnit | null>(null)

  const { data: companies = [] } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: () => pocketbaseService.listCompanies(),
  })

  const { data: bus = [], isLoading } = useQuery({
    queryKey: ['admin-bus', selectedCompany?.code],
    queryFn: () => pocketbaseService.listBusinessUnits(selectedCompany!.code),
    enabled: !!selectedCompany,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => pocketbaseService.createBusinessUnit(name, selectedCompany!.code),
    onSuccess: (bu) => {
      qc.invalidateQueries({ queryKey: ['admin-bus', selectedCompany?.code] })
      toast.success(`Business unit created with code: ${bu.code}`)
      setNewName('')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => pocketbaseService.updateBusinessUnit(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-bus', selectedCompany?.code] })
      toast.success('Business unit updated')
      setEditId(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pocketbaseService.deleteBusinessUnit(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-bus', selectedCompany?.code] })
      toast.success('Business unit deleted')
      setConfirmDelete(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div>
      <div className="mb-6">
        <label className="label">Select Company</label>
        <select
          className="input-field max-w-xs"
          value={selectedCompany?.id || ''}
          onChange={(e) => {
            const c = companies.find((x) => x.id === e.target.value) || null
            setSelectedCompany(c)
            setEditId(null)
          }}
        >
          <option value="">— choose a company —</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
          ))}
        </select>
      </div>

      {selectedCompany && (
        <>
          <div className="flex items-end gap-3 mb-6">
            <div className="flex-1 max-w-xs">
              <label className="label">New Business Unit Name</label>
              <input
                className="input-field"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && newName.trim() && createMutation.mutate(newName.trim())}
                placeholder="e.g. Sales"
              />
            </div>
            <button
              className="btn-primary px-4"
              disabled={!newName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate(newName.trim())}
            >
              Add BU
            </button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : bus.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm py-4">No business units for this company yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 pr-4 text-gray-500 dark:text-gray-400 font-medium w-24">Code</th>
                  <th className="text-left py-2 pr-4 text-gray-500 dark:text-gray-400 font-medium">Name</th>
                  <th className="py-2 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {bus.map((bu) => (
                  <tr key={bu.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 pr-4"><CodeBadge code={bu.code} /></td>
                    <td className="py-2 pr-4">
                      {editId === bu.id ? (
                        <input
                          className="input-field py-1"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') updateMutation.mutate({ id: bu.id, name: editName.trim() })
                            if (e.key === 'Escape') setEditId(null)
                          }}
                          autoFocus
                        />
                      ) : (
                        <span className="text-gray-800 dark:text-gray-200">{bu.name}</span>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2 justify-end">
                        {editId === bu.id ? (
                          <>
                            <button
                              className="btn-primary px-3 py-1 text-xs"
                              disabled={updateMutation.isPending}
                              onClick={() => updateMutation.mutate({ id: bu.id, name: editName.trim() })}
                            >
                              Save
                            </button>
                            <button className="btn-secondary px-3 py-1 text-xs" onClick={() => setEditId(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn-secondary px-3 py-1 text-xs"
                              onClick={() => { setEditId(bu.id); setEditName(bu.name) }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn-danger px-3 py-1 text-xs"
                              onClick={() => setConfirmDelete(bu)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={`Delete business unit "${confirmDelete.name}" (${confirmDelete.code})? This will also delete all associated teams.`}
          onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

// ── Teams Tab ─────────────────────────────────────────────────────────────────

function TeamsTab() {
  const qc = useQueryClient()
  const [selectedCompany, setSelectedCompany] = useState<ProfileCompany | null>(null)
  const [selectedBU, setSelectedBU] = useState<ProfileBusinessUnit | null>(null)
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<ProfileTeam | null>(null)

  const { data: companies = [] } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: () => pocketbaseService.listCompanies(),
  })

  const { data: bus = [] } = useQuery({
    queryKey: ['admin-bus', selectedCompany?.code],
    queryFn: () => pocketbaseService.listBusinessUnits(selectedCompany!.code),
    enabled: !!selectedCompany,
  })

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['admin-teams', selectedCompany?.code, selectedBU?.code],
    queryFn: () => pocketbaseService.listTeams(selectedCompany!.code, selectedBU!.code),
    enabled: !!selectedCompany && !!selectedBU,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => pocketbaseService.createTeam(name, selectedCompany!.code, selectedBU!.code),
    onSuccess: (team) => {
      qc.invalidateQueries({ queryKey: ['admin-teams', selectedCompany?.code, selectedBU?.code] })
      toast.success(`Team created with code: ${team.code}`)
      setNewName('')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => pocketbaseService.updateTeam(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-teams', selectedCompany?.code, selectedBU?.code] })
      toast.success('Team updated')
      setEditId(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pocketbaseService.deleteTeam(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-teams', selectedCompany?.code, selectedBU?.code] })
      toast.success('Team deleted')
      setConfirmDelete(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div>
      <div className="flex gap-4 mb-6 flex-wrap">
        <div>
          <label className="label">Select Company</label>
          <select
            className="input-field"
            value={selectedCompany?.id || ''}
            onChange={(e) => {
              const c = companies.find((x) => x.id === e.target.value) || null
              setSelectedCompany(c)
              setSelectedBU(null)
              setEditId(null)
            }}
          >
            <option value="">— choose a company —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
            ))}
          </select>
        </div>
        {selectedCompany && (
          <div>
            <label className="label">Select Business Unit</label>
            <select
              className="input-field"
              value={selectedBU?.id || ''}
              onChange={(e) => {
                const bu = bus.find((x) => x.id === e.target.value) || null
                setSelectedBU(bu)
                setEditId(null)
              }}
            >
              <option value="">— choose a BU —</option>
              {bus.map((bu) => (
                <option key={bu.id} value={bu.id}>{bu.name} ({bu.code})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {selectedCompany && selectedBU && (
        <>
          <div className="flex items-end gap-3 mb-6">
            <div className="flex-1 max-w-xs">
              <label className="label">New Team Name</label>
              <input
                className="input-field"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && newName.trim() && createMutation.mutate(newName.trim())}
                placeholder="e.g. Analytics"
              />
            </div>
            <button
              className="btn-primary px-4"
              disabled={!newName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate(newName.trim())}
            >
              Add Team
            </button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : teams.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm py-4">No teams for this BU yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 pr-4 text-gray-500 dark:text-gray-400 font-medium w-24">Code</th>
                  <th className="text-left py-2 pr-4 text-gray-500 dark:text-gray-400 font-medium">Name</th>
                  <th className="py-2 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 pr-4"><CodeBadge code={t.code} /></td>
                    <td className="py-2 pr-4">
                      {editId === t.id ? (
                        <input
                          className="input-field py-1"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') updateMutation.mutate({ id: t.id, name: editName.trim() })
                            if (e.key === 'Escape') setEditId(null)
                          }}
                          autoFocus
                        />
                      ) : (
                        <span className="text-gray-800 dark:text-gray-200">{t.name}</span>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2 justify-end">
                        {editId === t.id ? (
                          <>
                            <button
                              className="btn-primary px-3 py-1 text-xs"
                              disabled={updateMutation.isPending}
                              onClick={() => updateMutation.mutate({ id: t.id, name: editName.trim() })}
                            >
                              Save
                            </button>
                            <button className="btn-secondary px-3 py-1 text-xs" onClick={() => setEditId(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn-secondary px-3 py-1 text-xs"
                              onClick={() => { setEditId(t.id); setEditName(t.name) }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn-danger px-3 py-1 text-xs"
                              onClick={() => setConfirmDelete(t)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={`Delete team "${confirmDelete.name}" (${confirmDelete.code})?`}
          onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfileManagerPage() {
  const [activeTab, setActiveTab] = useState<Tab>('companies')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'companies', label: 'Companies' },
    { key: 'business-units', label: 'Business Units' },
    { key: 'teams', label: 'Teams' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Profile Manager</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Manage company, business unit, and team profile codes. Codes are auto-generated.
          Reserved codes: <span className="font-mono">adm</span> (admin) and <span className="font-mono">000</span> (blank).
        </p>

        <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === t.key
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          {activeTab === 'companies' && <CompaniesTab />}
          {activeTab === 'business-units' && <BusinessUnitsTab />}
          {activeTab === 'teams' && <TeamsTab />}
        </div>
      </div>
    </div>
  )
}
