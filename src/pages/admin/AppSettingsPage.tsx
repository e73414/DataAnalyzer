import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { pocketbaseService } from '../../services/mcpPocketbaseService'
import { useAppSettings } from '../../context/AppSettingsContext'
import Navigation from '../../components/Navigation'

const CHUNK_OPTIONS = [
  { value: '5000',  label: '5,000 rows' },
  { value: '10000', label: '10,000 rows' },
  { value: '15000', label: '15,000 rows' },
  { value: '20000', label: '20,000 rows' },
]

const REPORT_DETAIL_OPTIONS = ['Simple Report', 'Detailed Report']

const SHOW_STEPS_OPTIONS = ['Highly Detailed', 'Some Detail', 'Just Overview', 'None']

export default function AppSettingsPage() {
  const qc = useQueryClient()
  const { appSettings, refetchSettings } = useAppSettings()

  const { data: aiModels = [], isLoading: isLoadingModels } = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => pocketbaseService.getAIModels(),
  })

  // Form state — empty string = "No selection" (maps to null on save)
  const [analyzeModel,   setAnalyzeModel]   = useState('')
  const [planModel,      setPlanModel]      = useState('')
  const [executeModel,   setExecuteModel]   = useState('')
  const [chunkThreshold, setChunkThreshold] = useState('')
  const [detailLevel,    setDetailLevel]    = useState('')
  const [reportDetail,   setReportDetail]   = useState('')
  const [validatePrompt, setValidatePrompt] = useState('')

  // Seed form from loaded settings
  useEffect(() => {
    if (!appSettings) return
    setAnalyzeModel(appSettings.analyze_model ?? '')
    setPlanModel(appSettings.plan_model ?? '')
    setExecuteModel(appSettings.execute_model ?? '')
    setChunkThreshold(appSettings.chunk_threshold ?? '')
    setDetailLevel(appSettings.detail_level ?? '')
    setReportDetail(appSettings.report_detail ?? '')
    setValidatePrompt(appSettings.validate_prompt ?? '')
  }, [appSettings])

  const saveMutation = useMutation({
    mutationFn: async () => {
      await Promise.all([
        pocketbaseService.updateAppSetting('analyze_model',   analyzeModel   || null),
        pocketbaseService.updateAppSetting('plan_model',      planModel      || null),
        pocketbaseService.updateAppSetting('execute_model',   executeModel   || null),
        pocketbaseService.updateAppSetting('chunk_threshold', chunkThreshold || null),
        pocketbaseService.updateAppSetting('detail_level',    detailLevel    || null),
        pocketbaseService.updateAppSetting('report_detail',   reportDetail   || null),
        pocketbaseService.updateAppSetting('validate_prompt', validatePrompt || null),
      ])
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-settings'] })
      refetchSettings()
      toast.success('Settings saved')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navigation />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">App Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Settings set here apply to all users. Select "No selection" to let users choose their own.
        </p>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">

          {/* Section: AI Models */}
          <div className="px-6 py-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-4">
              AI Models
            </h2>
            <div className="space-y-4">
              {[
                { label: 'Analyze Page AI Model',       value: analyzeModel,   setter: setAnalyzeModel },
                { label: 'Plan Report AI Model',         value: planModel,      setter: setPlanModel },
                { label: 'Execute Report AI Model',      value: executeModel,   setter: setExecuteModel },
              ].map(({ label, value, setter }) => (
                <div key={label} className="flex items-center gap-4">
                  <label className="w-52 text-sm text-gray-700 dark:text-gray-300 shrink-0">{label}</label>
                  <select
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    className="input-field flex-1"
                    disabled={isLoadingModels || saveMutation.isPending}
                  >
                    <option value="">No selection (user chooses)</option>
                    {aiModels.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Execute Plan Controls */}
          <div className="px-6 py-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-4">
              Execute Plan Controls
            </h2>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="w-52 text-sm text-gray-700 dark:text-gray-300 shrink-0">Rows Per Chunk</label>
                <select
                  value={chunkThreshold}
                  onChange={(e) => setChunkThreshold(e.target.value)}
                  className="input-field flex-1"
                  disabled={saveMutation.isPending}
                >
                  <option value="">No selection (user chooses)</option>
                  {CHUNK_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-4">
                <label className="w-52 text-sm text-gray-700 dark:text-gray-300 shrink-0">Detail Level</label>
                <select
                  value={reportDetail}
                  onChange={(e) => setReportDetail(e.target.value)}
                  className="input-field flex-1"
                  disabled={saveMutation.isPending}
                >
                  <option value="">No selection (user chooses)</option>
                  {REPORT_DETAIL_OPTIONS.map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-4">
                <label className="w-52 text-sm text-gray-700 dark:text-gray-300 shrink-0">Show Steps</label>
                <select
                  value={detailLevel}
                  onChange={(e) => setDetailLevel(e.target.value)}
                  className="input-field flex-1"
                  disabled={saveMutation.isPending}
                >
                  <option value="">No selection (user chooses)</option>
                  {SHOW_STEPS_OPTIONS.map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section: Report Validation */}
          <div className="px-6 py-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-4">
              Report Validation
            </h2>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Validation Prompt</label>
              <textarea
                value={validatePrompt}
                onChange={(e) => setValidatePrompt(e.target.value)}
                rows={8}
                className="input-field resize-y font-mono text-xs"
                placeholder="Instructions appended to the AI validation agent's system prompt. Leave blank to use the default behaviour."
                disabled={saveMutation.isPending}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Appended to the system prompt when validating a report. Leave blank to rely on the workflow default.
              </p>
            </div>
          </div>

          {/* Save button */}
          <div className="px-6 py-4 flex justify-end">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="btn-primary"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
