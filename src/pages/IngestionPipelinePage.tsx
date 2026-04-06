import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import Navigation from '../components/Navigation'
import HelpTip from '../components/HelpTip'
import type { IngestionSchedule } from '../types'

type ScheduleWithName = IngestionSchedule & { dataset_name: string }

const SOURCE_LABELS: Record<string, string> = {
  google_drive:  'Google Drive',
  onedrive:      'OneDrive',
  google_sheets: 'Google Sheet',
  onedrive_file: 'OneDrive File',
  email:         'Email',
}

function statusBadge(status: string | null) {
  if (!status) return <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
  const map: Record<string, string> = {
    success:      'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    completed:    'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    fail:         'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    failed:       'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    no_new_file:  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    started:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    processing:   'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    pending_choice: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    no_datasets:  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  }
  const cls = map[status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
  const labels: Record<string, string> = {
    no_new_file: 'No new file', pending_choice: 'Awaiting choice', no_datasets: 'No datasets'
  }
  const label = labels[status] ?? status.charAt(0).toUpperCase() + status.slice(1)
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
}

function sourceIcon(type: string) {
  if (type === 'google_drive' || type === 'google_sheets') {
    return (
      <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 11.6L6 2H2l6 10.4L2 22h4l6-10.4zm8 0L14 2h-4l6 9.6L10 22h4l6-10.4z" />
      </svg>
    )
  }
  if (type === 'onedrive' || type === 'onedrive_file') {
    return (
      <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.5 2.4L2 7.6V16l9.5 5.5 9.5-5.5V7.6L11.5 2.4zm0 1.6l7.8 4.5-7.8 4.5L3.7 8.5 11.5 4zm-8.5 5.3l8 4.6v7.8L3 17.4V9.3zm9.5 4.6l8-4.6v8.1l-8 4.5v-8z" />
      </svg>
    )
  }
  return (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

export default function IngestionPipelinePage() {
  const { session } = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [runningId, setRunningId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'cloud' | 'email'>('cloud')

  const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ['ingestion-schedules', session?.email],
    queryFn: () => pocketbaseService.getIngestionSchedules(session!.email),
    enabled: !!session?.email,
  })

  const { data: emailRequests = [], isLoading: emailLoading } = useQuery({
    queryKey: ['email-ingestion-requests', session?.email],
    queryFn: () => pocketbaseService.getEmailIngestionRequests(session!.email),
    enabled: !!session?.email,
  })

  const handleRunNow = async (s: ScheduleWithName) => {
    if (!session?.email) return
    setRunningId(s.dataset_id)
    try {
      const result = await pocketbaseService.runIngestionNow(s.dataset_id, session.email)
      toast.success(result.message || 'Ingestion started')
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['ingestion-schedules', session?.email] })
      }, 3000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start ingestion')
    } finally {
      setRunningId(null)
    }
  }

  const handleToggleEnabled = async (s: ScheduleWithName) => {
    try {
      await pocketbaseService.updateIngestionSchedule(s.dataset_id, { enabled: !s.enabled })
      queryClient.invalidateQueries({ queryKey: ['ingestion-schedules', session?.email] })
      toast.success(s.enabled ? 'Schedule paused' : 'Schedule enabled')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update schedule')
    }
  }

  return (
    <div className="min-h-screen bg-gray-200 dark:bg-gray-950 transition-colors duration-200">
      <Navigation />

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ingestion Pipelines</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage automated data refresh schedules and view ingestion history.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-300 dark:border-gray-700">
          {([
            { id: 'cloud', label: 'Cloud Pipelines', count: schedules.length },
            { id: 'email', label: 'Email Ingestion', count: emailRequests.length },
          ] as { id: 'cloud' | 'email'; label: string; count: number }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.id
                  ? 'border-purple-700 text-purple-800 dark:text-purple-300 dark:border-purple-500'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Cloud Pipelines Tab */}
        {activeTab === 'cloud' && (
          <div className="card overflow-hidden">
            {schedulesLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-purple-600 border-t-transparent" />
              </div>
            ) : schedules.length === 0 ? (
              <div className="text-center py-16">
                <svg className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400 text-sm">No ingestion pipelines configured yet.</p>
                <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Open a dataset and set up a schedule from its ingestion settings.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                    <th className="text-left px-5 py-3 font-medium text-gray-600 dark:text-gray-300">Dataset</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300 hidden sm:table-cell">Source</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300 hidden md:table-cell flex items-center gap-1.5">
                      Schedule
                      <HelpTip text="How often this pipeline runs (e.g., daily at midnight). Leave empty for manual ingestion only." side="left" />
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300 hidden lg:table-cell">Last Run</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                      Status
                      <HelpTip text="Shows the result of the last ingestion: success, failure, or no new file detected." />
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {schedules.map((s: ScheduleWithName) => (
                    <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                          <span className="font-medium text-gray-900 dark:text-white truncate max-w-[180px]" title={s.dataset_name}>
                            {s.dataset_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                          {sourceIcon(s.location_type)}
                          <span className="text-xs">{SOURCE_LABELS[s.location_type] ?? s.location_type}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        {s.schedule
                          ? <code className="text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded">{s.schedule}</code>
                          : <span className="text-xs text-gray-400 dark:text-gray-500">Manual only</span>
                        }
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {s.last_run_at ? new Date(s.last_run_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-4">
                        {statusBadge(s.last_run_status)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleEnabled(s)}
                            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                              s.enabled
                                ? 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                : 'text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
                            }`}
                            title={s.enabled ? 'Pause schedule' : 'Enable schedule'}
                          >
                            {s.enabled ? 'Pause' : 'Enable'}
                          </button>
                          <button
                            onClick={() => handleRunNow(s)}
                            disabled={runningId === s.dataset_id}
                            className="text-xs px-2.5 py-1 rounded-md font-medium text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-50 transition-colors"
                          >
                            {runningId === s.dataset_id ? 'Running…' : 'Run now'}
                          </button>
                          <button
                            onClick={() => navigate(`/ingestion/${s.dataset_id}`)}
                            className="text-xs px-2.5 py-1 rounded-md font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Email Ingestion Tab */}
        {activeTab === 'email' && (
          <div className="card overflow-hidden">
            {emailLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-purple-600 border-t-transparent" />
              </div>
            ) : emailRequests.length === 0 ? (
              <div className="text-center py-16">
                <svg className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400 text-sm">No email ingestion requests yet.</p>
                <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Send an email with a file attachment to trigger dataset ingestion.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                    <th className="text-left px-5 py-3 font-medium text-gray-600 dark:text-gray-300">File</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300 hidden sm:table-cell">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300 hidden md:table-cell">Rows</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {emailRequests.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[220px]" title={r.file_name ?? ''}>
                          {r.file_name || '—'}
                        </p>
                        {r.subject && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5" title={r.subject}>
                            {r.subject}
                          </p>
                        )}
                        {r.error_message && (
                          <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 truncate" title={r.error_message}>
                            {r.error_message}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-gray-500 dark:text-gray-400 hidden sm:table-cell whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-4">
                        {statusBadge(r.status)}
                      </td>
                      <td className="px-4 py-4 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell">
                        {r.result_rows_inserted != null ? r.result_rows_inserted.toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
