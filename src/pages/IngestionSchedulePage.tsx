import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import Navigation from '../components/Navigation'
import type { DriveFile, IngestionFile } from '../types'

type SourceType = 'google_drive' | 'onedrive'

const SCHEDULE_PRESETS = [
  { label: 'Manual only', value: '' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Daily at 6 AM', value: '0 6 * * *' },
  { label: 'Weekly (Mon 6 AM)', value: '0 6 * * 1' },
  { label: 'Custom cron…', value: '__custom__' },
]

function parseFolderId(input: string, sourceType: SourceType): string {
  if (sourceType === 'google_drive') {
    const m = input.match(/\/folders\/([a-zA-Z0-9_-]+)/)
    return m ? m[1] : input.trim()
  }
  // OneDrive: extract ?id= param from URL
  const m = input.match(/[?&]id=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : input.trim()
}

function statusBadge(status: string | null) {
  if (!status) return null
  const map: Record<string, string> = {
    success: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    fail: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    no_new_file: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    started: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  }
  const cls = map[status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
  const label = status === 'no_new_file' ? 'No new file' : status.charAt(0).toUpperCase() + status.slice(1)
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
}

export default function IngestionSchedulePage() {
  const { datasetId } = useParams<{ datasetId: string }>()
  const { session } = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()

  // ── Form state ──────────────────────────────────────────────────────────────
  const [sourceType, setSourceType] = useState<SourceType>('google_drive')
  const [folderInput, setFolderInput] = useState('')
  const [schedulePreset, setSchedulePreset] = useState('')
  const [customCron, setCustomCron] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [previewFiles, setPreviewFiles] = useState<DriveFile[]>([])
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [formDirty, setFormDirty] = useState(false)

  if (!datasetId) return null

  // ── Handle OAuth callback toasts ─────────────────────────────────────────
  useEffect(() => {
    if (searchParams.get('ms_connected') === '1') {
      toast.success('OneDrive connected successfully')
      queryClient.invalidateQueries({ queryKey: ['microsoft-token-status'] })
    }
    if (searchParams.get('error')) {
      toast.error(`Connection error: ${searchParams.get('error')}`)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data fetching ───────────────────────────────────────────────────────────
  const { data: tokenStatus } = useQuery({
    queryKey: ['google-token-status', session?.email],
    queryFn: () => pocketbaseService.getGoogleTokenStatus(session!.email),
    enabled: !!session?.email,
    refetchOnMount: 'always',
  })

  const { data: msTokenStatus } = useQuery({
    queryKey: ['microsoft-token-status', session?.email],
    queryFn: () => pocketbaseService.getMicrosoftTokenStatus(session!.email),
    enabled: !!session?.email,
    refetchOnMount: 'always',
  })

  const { data: schedule } = useQuery({
    queryKey: ['ingestion-schedule', datasetId],
    queryFn: () => pocketbaseService.getIngestionSchedule(datasetId),
    enabled: !!datasetId,
    refetchOnMount: 'always',
  })

  const { data: ingestionFiles, isLoading: filesLoading } = useQuery({
    queryKey: ['ingestion-files', datasetId],
    queryFn: () => pocketbaseService.getIngestionFiles(datasetId),
    enabled: !!datasetId,
    refetchOnMount: 'always',
  })

  const { data: ingestionConfig } = useQuery({
    queryKey: ['ingestion-config', datasetId],
    queryFn: () => pocketbaseService.getIngestionConfig(datasetId),
    enabled: !!datasetId,
  })

  // Populate form when schedule loads
  useEffect(() => {
    if (!schedule || formDirty) return
    setFolderInput(schedule.folder_id)
    setEnabled(schedule.enabled)
    setSourceType((schedule.location_type as SourceType) || 'google_drive')
    if (!schedule.schedule) {
      setSchedulePreset('')
    } else {
      const preset = SCHEDULE_PRESETS.find(p => p.value === schedule.schedule && p.value !== '__custom__')
      if (preset) {
        setSchedulePreset(preset.value)
      } else {
        setSchedulePreset('__custom__')
        setCustomCron(schedule.schedule)
      }
    }
  }, [schedule, formDirty])

  // ── Access guard ────────────────────────────────────────────────────────────
  const isAdmin = session?.profile?.trim() === 'admadmadm'
  const isOwner = schedule ? schedule.owner_email === session?.email : true
  if (!isAdmin && !isOwner && schedule) {
    navigate('/')
    return null
  }

  // ── Mutations ───────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!session?.email) throw new Error('Not logged in')
      const folderId = parseFolderId(folderInput, sourceType)
      if (!folderId) throw new Error('Folder ID is required')
      const cronValue = schedulePreset === '__custom__' ? customCron.trim() : schedulePreset

      const payload = {
        dataset_id: datasetId,
        owner_email: session.email,
        folder_id: folderId,
        location_type: sourceType,
        schedule: cronValue || null,
        enabled,
      }
      return pocketbaseService.saveIngestionSchedule(payload)
    },
    onSuccess: () => {
      toast.success('Schedule saved')
      setFormDirty(false)
      queryClient.invalidateQueries({ queryKey: ['ingestion-schedule', datasetId] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => pocketbaseService.deleteIngestionSchedule(datasetId),
    onSuccess: () => {
      toast.success('Schedule deleted')
      queryClient.invalidateQueries({ queryKey: ['ingestion-schedule', datasetId] })
      setFolderInput('')
      setSchedulePreset('')
      setCustomCron('')
      setEnabled(true)
      setFormDirty(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleConnectGoogle = async () => {
    if (!session?.email) return
    try {
      const url = await pocketbaseService.getGoogleAuthUrl(session.email)
      window.location.href = url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to get auth URL')
    }
  }

  const handleDisconnectGoogle = async () => {
    if (!session?.email) return
    if (!window.confirm('Disconnect Google Drive? Existing schedules using Google Drive will stop working.')) return
    try {
      await pocketbaseService.disconnectGoogle(session.email)
      queryClient.invalidateQueries({ queryKey: ['google-token-status'] })
      toast.success('Google Drive disconnected')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Disconnect failed')
    }
  }

  const handleConnectMicrosoft = async () => {
    if (!session?.email) return
    try {
      const url = await pocketbaseService.getMicrosoftAuthUrl(session.email)
      window.location.href = url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to get auth URL')
    }
  }

  const handleDisconnectMicrosoft = async () => {
    if (!session?.email) return
    if (!window.confirm('Disconnect OneDrive? Existing schedules using OneDrive will stop working.')) return
    try {
      await pocketbaseService.disconnectMicrosoft(session.email)
      queryClient.invalidateQueries({ queryKey: ['microsoft-token-status'] })
      toast.success('OneDrive disconnected')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Disconnect failed')
    }
  }

  const activeConnection = sourceType === 'onedrive' ? msTokenStatus?.connected : tokenStatus?.connected

  const handlePreview = async () => {
    if (!session?.email || !folderInput.trim()) return
    setIsPreviewing(true)
    setPreviewFiles([])
    try {
      const folderId = parseFolderId(folderInput, sourceType)
      const files = sourceType === 'onedrive'
        ? await pocketbaseService.listOneDriveFiles(session.email, folderId)
        : await pocketbaseService.listDriveFiles(session.email, folderId)
      setPreviewFiles(files)
      if (files.length === 0) toast('No files found in this folder', { icon: 'ℹ️' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not list files')
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleRunNow = async () => {
    if (!session?.email || !datasetId) return
    setIsRunning(true)
    try {
      const result = await pocketbaseService.runIngestionNow(datasetId, session.email)
      toast.success(result.message || 'Ingestion started. Check history below for results.')
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['ingestion-files', datasetId] })
        queryClient.invalidateQueries({ queryKey: ['ingestion-schedule', datasetId] })
      }, 3000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start ingestion')
    } finally {
      setIsRunning(false)
    }
  }

  const effectiveCron = schedulePreset === '__custom__' ? customCron.trim() : schedulePreset

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ingestion Schedule</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Automate dataset updates by polling a cloud storage folder for new files.
          </p>
          {ingestionConfig
            ? <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Ingestion config saved — transformation settings will be replayed automatically.
              </p>
            : <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                No ingestion config yet. Create this dataset via CSV Optimizer PLUS to save transformation settings.
              </p>
          }
        </div>

        {/* Source selector */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
            File Source
          </h2>
          <div className="flex gap-6">
            {([
              { value: 'google_drive', label: 'Google Drive' },
              { value: 'onedrive',     label: 'OneDrive' },
            ] as { value: SourceType; label: string }[]).map(opt => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="sourceType"
                  value={opt.value}
                  checked={sourceType === opt.value}
                  onChange={() => { setSourceType(opt.value); setPreviewFiles([]); setFormDirty(true) }}
                  className="accent-blue-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Connection section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
            {sourceType === 'onedrive' ? 'OneDrive Connection' : 'Google Drive Connection'}
          </h2>

          {sourceType === 'google_drive' ? (
            tokenStatus?.connected ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Google Drive connected
                </div>
                <button onClick={handleDisconnectGoogle} className="text-xs text-red-600 dark:text-red-400 hover:underline">
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-gray-400">Not connected</p>
                <button
                  onClick={handleConnectGoogle}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 11.6L6 2H2l6 10.4L2 22h4l6-10.4zm8 0L14 2h-4l6 9.6L10 22h4l6-10.4z" />
                  </svg>
                  Connect Google Drive
                </button>
              </div>
            )
          ) : (
            msTokenStatus?.connected ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  OneDrive connected
                </div>
                <button onClick={handleDisconnectMicrosoft} className="text-xs text-red-600 dark:text-red-400 hover:underline">
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-gray-400">Not connected</p>
                <button
                  onClick={handleConnectMicrosoft}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.5 2.4L2 7.6V16l9.5 5.5 9.5-5.5V7.6L11.5 2.4zm0 1.6l7.8 4.5-7.8 4.5L3.7 8.5 11.5 4zm-8.5 5.3l8 4.6v7.8L3 17.4V9.3zm9.5 4.6l8-4.6v8.1l-8 4.5v-8z" />
                  </svg>
                  Connect OneDrive
                </button>
              </div>
            )
          )}
        </div>

        {/* Folder + Schedule Config */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Folder & Schedule
          </h2>

          {/* Folder input */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              {sourceType === 'onedrive' ? 'OneDrive Folder Item ID or URL' : 'Google Drive Folder ID or URL'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={folderInput}
                onChange={e => { setFolderInput(e.target.value); setFormDirty(true) }}
                placeholder={sourceType === 'onedrive' ? 'Paste OneDrive folder URL or item ID' : 'Paste folder URL or ID'}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handlePreview}
                disabled={isPreviewing || !folderInput.trim() || !activeConnection}
                className="px-3 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {isPreviewing ? 'Loading…' : 'Preview files'}
              </button>
            </div>
            {sourceType === 'onedrive' && (
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Tip: From OneDrive, open the folder and copy the URL — the item ID is in the <code className="font-mono">?id=</code> parameter.
              </p>
            )}
            {previewFiles.length > 0 && (
              <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                {previewFiles.slice(0, 5).map(f => (
                  <div key={f.id} className="flex items-center justify-between px-3 py-2 text-xs border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <span className="text-gray-800 dark:text-gray-200 truncate">{f.name}</span>
                    <span className="text-gray-400 dark:text-gray-500 ml-3 whitespace-nowrap">
                      {new Date(f.createdTime).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Check frequency
            </label>
            <select
              value={schedulePreset}
              onChange={e => { setSchedulePreset(e.target.value); setFormDirty(true) }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {SCHEDULE_PRESETS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            {schedulePreset === '__custom__' && (
              <input
                type="text"
                value={customCron}
                onChange={e => { setCustomCron(e.target.value); setFormDirty(true) }}
                placeholder="e.g. 0 9 * * 1-5 (weekdays at 9 AM)"
                className="mt-2 w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            )}
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setEnabled(v => !v); setFormDirty(true) }}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {enabled ? 'Schedule enabled' : 'Schedule paused'}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex gap-2">
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !folderInput.trim()}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {saveMutation.isPending && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {schedule ? 'Update Schedule' : 'Save Schedule'}
              </button>
              {schedule && (
                <button
                  onClick={() => { if (window.confirm('Delete this ingestion schedule?')) deleteMutation.mutate() }}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  Delete
                </button>
              )}
            </div>
            {schedule && (
              <button
                onClick={handleRunNow}
                disabled={isRunning || !activeConnection}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {isRunning ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Running…</>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Run Now
                  </>
                )}
              </button>
            )}
          </div>

          {/* Last run status */}
          {schedule?.last_run_at && (
            <div className="pt-1 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
              Last run: {new Date(schedule.last_run_at).toLocaleString()}
              {statusBadge(schedule.last_run_status)}
            </div>
          )}
          {effectiveCron && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Cron: <code className="font-mono">{effectiveCron}</code>
            </p>
          )}
        </div>

        {/* Ingestion History */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Ingestion History
            </h2>
          </div>
          {filesLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : !ingestionFiles || ingestionFiles.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-10">No ingestion runs yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">File</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300 hidden sm:table-cell">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300 hidden md:table-cell">Rows</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {ingestionFiles.map((f: IngestionFile) => (
                  <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-gray-800 dark:text-gray-200 truncate text-xs" title={f.file_name || ''}>
                        {f.file_name || '—'}
                      </p>
                      {f.error_message && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate" title={f.error_message}>
                          {f.error_message}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 hidden sm:table-cell whitespace-nowrap">
                      {f.ingested_at ? new Date(f.ingested_at).toLocaleString() : new Date(f.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {statusBadge(f.ingestion_result)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell">
                      {f.rows_inserted != null ? f.rows_inserted.toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}
