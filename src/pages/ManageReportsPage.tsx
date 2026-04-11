import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import Navigation from '../components/Navigation'
import ReportHtml from '../components/ReportHtml'
import type { ReportSchedule, ConversationHistory } from '../types'

type ScheduleFormState = {
  scheduleType: 'daily' | 'weekly' | 'monthly' | 'custom'
  time: string
  dayOfWeek?: number
  dayOfMonth?: number
  customCron?: string
  timezone: string
}

const COMMON_TIMEZONES = [
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Toronto', label: 'Toronto (ET)' },
  { value: 'America/Vancouver', label: 'Vancouver (PT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'UTC', label: 'UTC' },
]

function cronToFriendly(cron: string): string {
  const parts = cron.split(' ').filter(p => p.trim())
  if (parts.length !== 5) return cron

  const [minute, hour, dayMonth, month, dayWeek] = parts

  if (dayMonth === '*' && month === '*' && dayWeek === '*') {
    return `Daily at ${hour}:${minute.padStart(2, '0')}`
  }

  if (dayMonth === '*' && month === '*' && dayWeek !== '*') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const dayNum = parseInt(dayWeek)
    return isNaN(dayNum) ? cron : `Every ${days[dayNum] || 'day'} at ${hour}:${minute.padStart(2, '0')}`
  }

  if (month === '*' && dayWeek === '*' && dayMonth !== '*') {
    return `Monthly on day ${dayMonth} at ${hour}:${minute.padStart(2, '0')}`
  }

  return cron
}

function parseCronToForm(cron: string): Omit<ScheduleFormState, 'timezone'> {
  const parts = cron.split(' ').filter(p => p.trim())
  if (parts.length !== 5) {
    return { scheduleType: 'custom', time: '09:00', customCron: cron }
  }

  const [minute, hour, dayMonth, , dayWeek] = parts
  const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`

  // Daily: minute hour * * *
  if (dayMonth === '*' && dayWeek === '*') {
    return { scheduleType: 'daily', time }
  }

  // Weekly: minute hour * * dayOfWeek
  if (dayMonth === '*' && dayWeek !== '*') {
    const dow = parseInt(dayWeek)
    if (!isNaN(dow)) {
      return { scheduleType: 'weekly', time, dayOfWeek: dow }
    }
  }

  // Monthly: minute hour dayOfMonth * *
  if (dayMonth !== '*' && dayWeek === '*') {
    const dom = parseInt(dayMonth)
    if (!isNaN(dom)) {
      return { scheduleType: 'monthly', time, dayOfMonth: dom }
    }
  }

  // Custom
  return { scheduleType: 'custom', time: '09:00', customCron: cron }
}

function formatStatus(status?: string): { label: string; color: string } {
  switch (status) {
    case 'success':
      return { label: 'Success', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' }
    case 'failed':
      return { label: 'Failed', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' }
    case 'failed_max_retries':
      return { label: 'Failed (Max Retries)', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' }
    case 'running':
      return { label: 'Running', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' }
    default:
      return { label: 'Pending', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' }
  }
}

function RunsList({ scheduleId }: { scheduleId: string }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['schedule-runs', scheduleId],
    queryFn: () => pocketbaseService.getReportScheduleRuns(scheduleId),
  })

  const deleteRunMutation = useMutation({
    mutationFn: (runId: string) => pocketbaseService.deleteConversation(runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-runs', scheduleId] })
      toast.success('Report run deleted')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete run')
    },
  })

  const handleDeleteRun = (runId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm('Delete this report run? This will also delete all saved tables and step results.')) {
      deleteRunMutation.mutate(runId)
    }
  }

  if (isLoading) {
    return <p className="text-xs text-gray-500 dark:text-gray-400 px-4 py-2">Loading runs...</p>
  }

  if (runs.length === 0) {
    return <p className="text-xs text-gray-500 dark:text-gray-400 px-4 py-2">No completed runs yet.</p>
  }

  const handleLoadInPlanReport = (run: ConversationHistory) => {
    navigate('/plan-report', {
      state: {
        prompt: run.prompt.replace(/^\[Scheduled:[^\]]+\]\s*/, ''),
        reportPlan: run.report_plan,
        report: run.response,
        reportId: run.report_id,
        datasetId: run.dataset_id,
        datasetName: run.dataset_name,
        aiModel: run.ai_model,
        savedRecordId: run.id,
        detailLevel: run.detail_level,
        reportDetail: run.report_detail,
      },
    })
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
      {runs.map(run => {
        const isExpanded = expandedRunId === run.id
        return (
          <div key={run.id}>
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30"
              onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <svg
                  className={`w-3 h-3 flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  fill="currentColor" viewBox="0 0 24 24"
                >
                  <path d="M8 5l11 7-11 7V5z" />
                </svg>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-shrink-0">
                  {new Date(run.created).toLocaleString()}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {run.ai_model}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                {run.report_plan && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleLoadInPlanReport(run) }}
                    className="px-2 py-1 text-xs font-medium text-white bg-purple-900 hover:bg-purple-800 rounded transition-colors"
                    title="Load in Plan Report"
                  >
                    Load
                  </button>
                )}
                <button
                  onClick={(e) => handleDeleteRun(run.id, e)}
                  disabled={deleteRunMutation.isPending}
                  className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                  title="Delete this run and all saved tables"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
            {isExpanded && (
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-700/50">
                <ReportHtml
                  html={run.response ?? ''}
                  className="report-html prose prose-sm dark:prose-invert max-w-none"
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ManageReportsPage() {
  const { session } = useSession()
  const qc = useQueryClient()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [showRunsIds, setShowRunsIds] = useState<Set<string>>(new Set())
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<ScheduleFormState>({ scheduleType: 'daily', time: '09:00', timezone: 'America/Los_Angeles' })

  const { data: schedules = [], isLoading, error } = useQuery({
    queryKey: ['report-schedules'],
    queryFn: () => pocketbaseService.getReportSchedules(),
    enabled: !!session?.email,
    refetchInterval: (query) =>
      query.state.data?.some(s => s.last_run_status === 'running') ? 5000 : false,
  })

  const isAdmin = session?.profile?.trim() === 'admadmadm'
  const filteredSchedules = isAdmin ? schedules : schedules.filter(s => s.user_email === session?.email)

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pocketbaseService.deleteReportSchedule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-schedules'] })
      toast.success('Schedule deleted')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete schedule')
    },
  })

  const runNowMutation = useMutation({
    mutationFn: (id: string) => pocketbaseService.runReportScheduleNow(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-schedules'] })
      toast.success('Report run started')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to start run')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (schedule: ReportSchedule) =>
      pocketbaseService.updateReportSchedule(schedule.id, { enabled: !schedule.enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-schedules'] })
      toast.success('Schedule updated')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update schedule')
    },
  })

  const updateCronMutation = useMutation({
    mutationFn: ({ id, schedule, timezone }: { id: string; schedule: string; timezone: string }) =>
      pocketbaseService.updateReportSchedule(id, { schedule, timezone }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-schedules'] })
      setEditingScheduleId(null)
      setEditForm({ scheduleType: 'daily', time: '09:00', timezone: 'America/Los_Angeles' })
      toast.success('Schedule updated')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update schedule')
    },
  })

  const handleEditSchedule = (schedule: ReportSchedule) => {
    setEditingScheduleId(schedule.id)
    const cronParts = parseCronToForm(schedule.schedule)
    setEditForm({
      ...cronParts,
      timezone: schedule.timezone || 'America/Los_Angeles'
    })
  }

  const handleSaveSchedule = (id: string) => {
    let cronExpression = editForm.customCron || ''
    if (editForm.scheduleType === 'daily') {
      const [hour, minute] = editForm.time.split(':').map(Number)
      cronExpression = `${minute} ${hour} * * *`
    } else if (editForm.scheduleType === 'weekly') {
      const [hour, minute] = editForm.time.split(':').map(Number)
      const dayOfWeek = editForm.dayOfWeek ?? 1
      cronExpression = `${minute} ${hour} * * ${dayOfWeek}`
    } else if (editForm.scheduleType === 'monthly') {
      const [hour, minute] = editForm.time.split(':').map(Number)
      const dayOfMonth = editForm.dayOfMonth ?? 1
      cronExpression = `${minute} ${hour} ${dayOfMonth} * *`
    }

    if (!cronExpression.trim()) {
      toast.error('Invalid schedule')
      return
    }
    updateCronMutation.mutate({ id, schedule: cronExpression, timezone: editForm.timezone })
  }

  const handleCancelEdit = () => {
    setEditingScheduleId(null)
    setEditForm({ scheduleType: 'daily', time: '09:00', timezone: 'America/Los_Angeles' })
  }

  const handleDeleteSchedule = (id: string) => {
    if (window.confirm('Are you sure you want to delete this schedule?')) {
      deleteMutation.mutate(id)
    }
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) { newSet.delete(id) } else { newSet.add(id) }
      return newSet
    })
  }

  const toggleRuns = (id: string) => {
    setShowRunsIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) { newSet.delete(id) } else { newSet.add(id) }
      return newSet
    })
  }

  return (
    <div className="min-h-screen bg-gray-200 dark:bg-gray-950 transition-colors duration-200">
      <Navigation />

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Manage Scheduled Reports</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {isAdmin ? 'View and manage all scheduled reports.' : 'View and manage your scheduled reports.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-300">Error loading schedules: {error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading schedules...</p>
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">No scheduled reports yet.</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">Create one from the Plan Report page after saving a report.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSchedules.map(schedule => {
              const isExpanded = expandedIds.has(schedule.id)
              const runsVisible = showRunsIds.has(schedule.id)
              const statusBadge = formatStatus(schedule.last_run_status)
              return (
                <div
                  key={schedule.id}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors"
                >
                  {/* Schedule header row */}
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center justify-between"
                    onClick={() => toggleExpanded(schedule.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {isAdmin && <span className="text-xs text-gray-500 dark:text-gray-400">{schedule.user_email}</span>}
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {schedule.dataset_name}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {cronToFriendly(schedule.schedule)}
                          {schedule.timezone && (
                            <span className="ml-1 text-gray-400">({COMMON_TIMEZONES.find(tz => tz.value === schedule.timezone)?.label || schedule.timezone})</span>
                          )}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${statusBadge.color}`}>
                          {statusBadge.label}
                        </span>
                        {schedule.last_run_at && (
                          <span className="text-xs text-gray-500 dark:text-gray-500">
                            Last run: {new Date(schedule.last_run_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditSchedule(schedule) }}
                        className="px-2 py-1 text-xs font-medium text-white bg-gray-600 hover:bg-gray-500 rounded transition-colors"
                        title="Edit schedule"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); runNowMutation.mutate(schedule.id) }}
                        disabled={runNowMutation.isPending || schedule.last_run_status === 'running'}
                        className="px-2 py-1 text-xs font-medium text-white bg-purple-900 hover:bg-purple-800 rounded disabled:opacity-50 transition-colors"
                        title="Run now"
                      >
                        {schedule.last_run_status === 'running' ? 'Running…' : 'Run Now'}
                      </button>
                      <input
                        type="checkbox"
                        checked={schedule.enabled}
                        onChange={(e) => { e.stopPropagation(); toggleMutation.mutate(schedule) }}
                        disabled={toggleMutation.isPending}
                        className="w-4 h-4 rounded accent-purple-900"
                        title={schedule.enabled ? 'Disable' : 'Enable'}
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteSchedule(schedule.id) }}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Edit schedule form */}
                  {editingScheduleId === schedule.id && (
                    <div
                      className="border-t border-gray-200 dark:border-gray-700 p-4 bg-blue-50 dark:bg-blue-900/20"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="space-y-4">
                        <label className="block">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Frequency</span>
                          <select
                            value={editForm.scheduleType}
                            onChange={e => setEditForm({...editForm, scheduleType: e.target.value as ScheduleFormState['scheduleType']})}
                            className="w-full mt-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="custom">Custom Cron</option>
                          </select>
                        </label>

                        {editForm.scheduleType === 'daily' && (
                          <label className="block">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Time</span>
                            <input
                              type="time"
                              value={editForm.time}
                              onChange={e => setEditForm({...editForm, time: e.target.value})}
                              className="w-full mt-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </label>
                        )}

                        {editForm.scheduleType === 'weekly' && (
                          <>
                            <label className="block">
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Day of Week</span>
                              <select
                                value={editForm.dayOfWeek ?? 1}
                                onChange={e => setEditForm({...editForm, dayOfWeek: parseInt(e.target.value)})}
                                className="w-full mt-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                              >
                                <option value={0}>Sunday</option>
                                <option value={1}>Monday</option>
                                <option value={2}>Tuesday</option>
                                <option value={3}>Wednesday</option>
                                <option value={4}>Thursday</option>
                                <option value={5}>Friday</option>
                                <option value={6}>Saturday</option>
                              </select>
                            </label>
                            <label className="block">
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Time</span>
                              <input
                                type="time"
                                value={editForm.time}
                                onChange={e => setEditForm({...editForm, time: e.target.value})}
                                className="w-full mt-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                              />
                            </label>
                          </>
                        )}

                        {editForm.scheduleType === 'monthly' && (
                          <>
                            <label className="block">
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Day of Month</span>
                              <input
                                type="number"
                                min={1}
                                max={31}
                                value={editForm.dayOfMonth ?? 1}
                                onChange={e => setEditForm({...editForm, dayOfMonth: parseInt(e.target.value)})}
                                className="w-full mt-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                              />
                            </label>
                            <label className="block">
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Time</span>
                              <input
                                type="time"
                                value={editForm.time}
                                onChange={e => setEditForm({...editForm, time: e.target.value})}
                                className="w-full mt-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                              />
                            </label>
                          </>
                        )}

                        {editForm.scheduleType === 'custom' && (
                          <label className="block">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Cron Expression</span>
                            <input
                              type="text"
                              placeholder="e.g., 0 9 * * 1"
                              value={editForm.customCron || ''}
                              onChange={e => setEditForm({...editForm, customCron: e.target.value})}
                              className="w-full mt-1 px-3 py-2 text-sm font-mono border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Format: minute hour day month dayOfWeek</p>
                          </label>
                        )}

                        <label className="block">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Timezone</span>
                          <select
                            value={editForm.timezone}
                            onChange={e => setEditForm({...editForm, timezone: e.target.value})}
                            className="w-full mt-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          >
                            {COMMON_TIMEZONES.map(tz => (
                              <option key={tz.value} value={tz.value}>{tz.label}</option>
                            ))}
                          </select>
                        </label>

                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={() => handleSaveSchedule(schedule.id)}
                            disabled={updateCronMutation.isPending}
                            className="px-4 py-2 text-sm font-medium text-white bg-purple-900 hover:bg-purple-800 rounded disabled:opacity-50 transition-colors"
                          >
                            {updateCronMutation.isPending ? 'Saving...' : 'Save Schedule'}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Schedule details */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50 space-y-3 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Schedule ID:</span>
                        <span className="ml-2 font-mono text-gray-900 dark:text-gray-100">{schedule.id}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Conversation:</span>
                        <span className="ml-2 font-mono text-gray-900 dark:text-gray-100 truncate">{schedule.conversation_id}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Plan Model:</span>
                        <span className="ml-2 text-gray-900 dark:text-gray-100">{schedule.plan_model}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Execute Model:</span>
                        <span className="ml-2 text-gray-900 dark:text-gray-100">{schedule.execute_model}</span>
                      </div>
                      {schedule.detail_level && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Detail Level:</span>
                          <span className="ml-2 text-gray-900 dark:text-gray-100">{schedule.detail_level}</span>
                        </div>
                      )}
                      {schedule.report_detail && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Report Detail:</span>
                          <span className="ml-2 text-gray-900 dark:text-gray-100">{schedule.report_detail}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Created:</span>
                        <span className="ml-2 text-gray-900 dark:text-gray-100">{new Date(schedule.created_at).toLocaleString()}</span>
                      </div>
                      {schedule.last_run_attempt !== undefined && schedule.last_run_attempt > 0 && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Failed Attempts:</span>
                          <span className="ml-2 text-gray-900 dark:text-gray-100">{schedule.last_run_attempt}/3</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Completed runs section */}
                  <div className="border-t border-gray-200 dark:border-gray-700">
                    <button
                      className="w-full flex items-center gap-2 px-4 py-3 text-base font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                      onClick={() => toggleRuns(schedule.id)}
                    >
                      <svg
                        className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${runsVisible ? 'rotate-90' : ''}`}
                        fill="currentColor" viewBox="0 0 24 24"
                      >
                        <path d="M8 5l11 7-11 7V5z" />
                      </svg>
                      <span>Completed Runs</span>
                    </button>
                    {runsVisible && (
                      <RunsList scheduleId={schedule.id} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
