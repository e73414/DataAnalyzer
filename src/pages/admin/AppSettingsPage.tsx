import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { pocketbaseService } from '../../services/mcpPocketbaseService'
import { useAppSettings } from '../../context/AppSettingsContext'
import Navigation from '../../components/Navigation'
import type { NavLink, AIModel } from '../../types'
import { useSession } from '../../context/SessionContext'

const CHUNK_OPTIONS = [
  { value: '5000',   label: '5,000 rows' },
  { value: '10000',  label: '10,000 rows' },
  { value: '15000',  label: '15,000 rows' },
  { value: '20000',  label: '20,000 rows' },
  { value: '50000',  label: '50,000 rows' },
  { value: '100000', label: '100,000 rows' },
  { value: '200000', label: '200,000 rows' },
]

const REPORT_DETAIL_OPTIONS = ['Simple Report', 'Detailed Report']
const SHOW_STEPS_OPTIONS = ['Highly Detailed', 'Some Detail', 'Just Overview', 'None']

// ── Editable row types ────────────────────────────────────────────────────────

interface EditableNavLink extends NavLink {
  _isNew?: boolean
}

interface EditableAIModel extends AIModel {
  _isNew?: boolean
}

// ── Drag-and-drop reorder helper ──────────────────────────────────────────────

function useDragReorder<T>(
  list: T[],
  setList: React.Dispatch<React.SetStateAction<T[]>>,
) {
  const dragIdx = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const handlers = (idx: number) => ({
    draggable: true as const,
    onDragStart: () => { dragIdx.current = idx },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverIdx(idx) },
    onDragLeave: () => setDragOverIdx(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDragOverIdx(null)
      const src = dragIdx.current
      if (src === null || src === idx) return
      const next = [...list]
      const [item] = next.splice(src, 1)
      next.splice(idx, 0, item)
      setList(next)
      dragIdx.current = null
    },
  })

  return { handlers, dragOverIdx }
}

// ── Nav Link Manager ──────────────────────────────────────────────────────────

function NavLinkManager() {
  const { session } = useSession()
  const qc = useQueryClient()
  const { data: serverLinks = [] } = useQuery({
    queryKey: ['nav-links'],
    queryFn: () => pocketbaseService.getNavLinks(),
  })

  const [links, setLinks] = useState<EditableNavLink[]>([])
  useEffect(() => { setLinks(serverLinks) }, [serverLinks])

  const { handlers, dragOverIdx } = useDragReorder(links, setLinks)
  const [isSaving, setIsSaving] = useState(false)

  const updateLink = (idx: number, patch: Partial<EditableNavLink>) => {
    setLinks(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  const addLink = () => {
    const maxOrder = links.reduce((m, l) => Math.max(m, l.order), 0)
    setLinks(prev => [...prev, {
      id: `_new_${Date.now()}`, name: '', path: '', order: maxOrder + 10,
      separator_before: false, _isNew: true,
    }])
  }

  const removeLink = (idx: number) => {
    setLinks(prev => prev.filter((_, i) => i !== idx))
  }

  const save = async () => {
    // Validate
    for (const l of links) {
      if (!l.name.trim() || !l.path.trim()) {
        toast.error('All links must have a name and path')
        return
      }
    }
    setIsSaving(true)
    try {
      // Assign order by position
      const ordered = links.map((l, i) => ({ ...l, order: (i + 1) * 10 }))

      // Determine which original IDs were deleted
      const originalIds = new Set(serverLinks.map(l => l.id))
      const keptIds = new Set(ordered.filter(l => !l._isNew).map(l => l.id))
      const deletedIds = [...originalIds].filter(id => !keptIds.has(id))

      await Promise.all([
        ...deletedIds.map(id => pocketbaseService.deleteNavLink(id, session!.email)),
        ...ordered.map(l => l._isNew
          ? pocketbaseService.createNavLink({ name: l.name, path: l.path, order: l.order, color: l.color, separator_before: l.separator_before }, session!.email)
          : pocketbaseService.updateNavLink(l.id, { name: l.name, path: l.path, order: l.order, color: l.color ?? null, separator_before: l.separator_before }, session!.email)
        ),
      ])

      await qc.invalidateQueries({ queryKey: ['nav-links'] })
      await qc.invalidateQueries({ queryKey: ['navLinks'] })
      toast.success('Nav links saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Nav Link Manager
        </h2>
        <div className="flex gap-2">
          <button onClick={addLink} className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
            + Add Link
          </button>
          <button onClick={save} disabled={isSaving} className="px-3 py-1.5 text-xs font-medium text-white bg-purple-900 hover:bg-purple-800 disabled:opacity-50 rounded-lg transition-colors">
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No nav links. Click "+ Add Link" to create one.</p>
      ) : (
        <div className="space-y-1.5">
          {/* Header */}
          <div className="grid grid-cols-[28px_1fr_1fr_80px_60px_36px] gap-2 px-2 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
            <span />
            <span>Name</span>
            <span>Path</span>
            <span className="text-center">Separator</span>
            <span>Color</span>
            <span />
          </div>
          {links.map((link, idx) => (
            <div
              key={link.id}
              {...handlers(idx)}
              className={`grid grid-cols-[28px_1fr_1fr_80px_60px_36px] gap-2 items-center p-2 rounded-lg border transition-colors cursor-move ${
                dragOverIdx === idx
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50'
              }`}
            >
              {/* Drag handle */}
              <span className="text-gray-300 dark:text-gray-600 select-none text-center cursor-grab text-lg leading-none">⋮⋮</span>

              {/* Name */}
              <input
                value={link.name}
                onChange={e => updateLink(idx, { name: e.target.value })}
                placeholder="Label"
                className="text-sm px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                onMouseDown={e => e.stopPropagation()}
              />

              {/* Path */}
              <input
                value={link.path}
                onChange={e => updateLink(idx, { path: e.target.value })}
                placeholder="/path"
                className="text-sm px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full font-mono"
                onMouseDown={e => e.stopPropagation()}
              />

              {/* Separator before */}
              <div className="flex justify-center">
                <input
                  type="checkbox"
                  checked={!!link.separator_before}
                  onChange={e => updateLink(idx, { separator_before: e.target.checked })}
                  className="w-4 h-4 rounded accent-blue-600"
                  onMouseDown={e => e.stopPropagation()}
                />
              </div>

              {/* Color */}
              <input
                value={link.color ?? ''}
                onChange={e => updateLink(idx, { color: e.target.value || undefined })}
                placeholder="red"
                className="text-sm px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                onMouseDown={e => e.stopPropagation()}
              />

              {/* Delete */}
              <button
                onClick={() => removeLink(idx)}
                onMouseDown={e => e.stopPropagation()}
                className="flex justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Remove"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AI Model Manager ──────────────────────────────────────────────────────────

function AIModelManager() {
  const { session } = useSession()
  const qc = useQueryClient()
  const { data: serverModels = [] } = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => pocketbaseService.getAIModels(),
  })

  const [models, setModels] = useState<EditableAIModel[]>([])
  useEffect(() => { setModels(serverModels) }, [serverModels])

  const { handlers, dragOverIdx } = useDragReorder(models, setModels)
  const [isSaving, setIsSaving] = useState(false)

  const updateModel = (idx: number, patch: Partial<EditableAIModel>) => {
    setModels(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m))
  }

  const addModel = () => {
    setModels(prev => [...prev, {
      id: '', db_id: `_new_${Date.now()}`, name: '', provider: '', description: '',
      display_order: 0, _isNew: true,
    }])
  }

  const removeModel = (idx: number) => {
    setModels(prev => prev.filter((_, i) => i !== idx))
  }

  const save = async () => {
    for (const m of models) {
      if (!m.id.trim() || !m.name.trim()) {
        toast.error('All models must have a Model ID and Name')
        return
      }
    }
    setIsSaving(true)
    try {
      const ordered = models.map((m, i) => ({ ...m, display_order: (i + 1) * 10 }))

      const originalDbIds = new Set(serverModels.map(m => m.db_id).filter(Boolean))
      const keptDbIds = new Set(ordered.filter(m => !m._isNew).map(m => m.db_id).filter(Boolean))
      const deletedDbIds = [...originalDbIds].filter(id => id && !keptDbIds.has(id)) as string[]

      await Promise.all([
        ...deletedDbIds.map(dbId => pocketbaseService.deleteAIModel(dbId, session!.email)),
        ...ordered.map(m => m._isNew
          ? pocketbaseService.createAIModel({ model_id: m.id, name: m.name, provider: m.provider, description: m.description, display_order: m.display_order }, session!.email)
          : pocketbaseService.updateAIModel(m.db_id!, { model_id: m.id, name: m.name, provider: m.provider || null, description: m.description || null, display_order: m.display_order }, session!.email)
        ),
      ])

      await qc.invalidateQueries({ queryKey: ['ai-models'] })
      toast.success('AI models saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          AI Model Manager
        </h2>
        <div className="flex gap-2">
          <button onClick={addModel} className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
            + Add Model
          </button>
          <button onClick={save} disabled={isSaving} className="px-3 py-1.5 text-xs font-medium text-white bg-purple-900 hover:bg-purple-800 disabled:opacity-50 rounded-lg transition-colors">
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {models.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No AI models. Click "+ Add Model" to create one.</p>
      ) : (
        <div className="space-y-1.5">
          {/* Header */}
          <div className="grid grid-cols-[28px_1fr_1fr_1fr_1fr_36px] gap-2 px-2 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
            <span />
            <span>Model ID</span>
            <span>Display Name</span>
            <span>Provider</span>
            <span>Description</span>
            <span />
          </div>
          {models.map((model, idx) => (
            <div
              key={model.db_id ?? idx}
              {...handlers(idx)}
              className={`grid grid-cols-[28px_1fr_1fr_1fr_1fr_36px] gap-2 items-center p-2 rounded-lg border transition-colors cursor-move ${
                dragOverIdx === idx
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50'
              }`}
            >
              {/* Drag handle */}
              <span className="text-gray-300 dark:text-gray-600 select-none text-center cursor-grab text-lg leading-none">⋮⋮</span>

              {/* Model ID */}
              <input
                value={model.id}
                onChange={e => updateModel(idx, { id: e.target.value })}
                placeholder="claude-opus-4-6"
                className="text-sm px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full font-mono"
                onMouseDown={e => e.stopPropagation()}
              />

              {/* Display Name */}
              <input
                value={model.name}
                onChange={e => updateModel(idx, { name: e.target.value })}
                placeholder="Claude Opus 4.6"
                className="text-sm px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                onMouseDown={e => e.stopPropagation()}
              />

              {/* Provider */}
              <input
                value={model.provider ?? ''}
                onChange={e => updateModel(idx, { provider: e.target.value })}
                placeholder="Anthropic"
                className="text-sm px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                onMouseDown={e => e.stopPropagation()}
              />

              {/* Description */}
              <input
                value={model.description ?? ''}
                onChange={e => updateModel(idx, { description: e.target.value })}
                placeholder="Optional description"
                className="text-sm px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                onMouseDown={e => e.stopPropagation()}
              />

              {/* Delete */}
              <button
                onClick={() => removeModel(idx)}
                onMouseDown={e => e.stopPropagation()}
                className="flex justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Remove"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AppSettingsPage() {
  const qc = useQueryClient()
  const { appSettings, refetchSettings } = useAppSettings()

  const { data: aiModels = [], isLoading: isLoadingModels } = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => pocketbaseService.getAIModels(),
  })

  const [appTitle,               setAppTitle]               = useState('')
  const [analyzeModel,           setAnalyzeModel]           = useState('')
  const [planModel,              setPlanModel]              = useState('')
  const [executeModel,           setExecuteModel]           = useState('')
  const [uploadModel,            setUploadModel]            = useState('')
  const [reportModel,            setReportModel]            = useState('')
  const [chunkThreshold,         setChunkThreshold]         = useState('')
  const [detailLevel,            setDetailLevel]            = useState('')
  const [reportDetail,           setReportDetail]           = useState('')
  const [showIngestionSchedule,  setShowIngestionSchedule]  = useState(false)
  const [showEnhancePrompt,      setShowEnhancePrompt]      = useState(false)
  const [datasetDescribePrompt,  setDatasetDescribePrompt]  = useState('')

  useEffect(() => {
    if (!appSettings) return
    setAppTitle(appSettings.app_title ?? '')
    setAnalyzeModel(appSettings.analyze_model ?? '')
    setPlanModel(appSettings.plan_model ?? '')
    setExecuteModel(appSettings.execute_model ?? '')
    setUploadModel(appSettings.upload_model ?? '')
    setReportModel(appSettings.report_model ?? '')
    setChunkThreshold(appSettings.chunk_threshold ?? '')
    setDetailLevel(appSettings.detail_level ?? '')
    setReportDetail(appSettings.report_detail ?? '')
    setShowIngestionSchedule(appSettings.show_ingestion_schedule === 'true')
    setShowEnhancePrompt(appSettings.show_enhance_prompt === 'true')
    setDatasetDescribePrompt(appSettings.dataset_describe_prompt ?? '')
  }, [appSettings])

  const saveMutation = useMutation({
    mutationFn: async () => {
      await Promise.all([
        pocketbaseService.updateAppSetting('app_title',               appTitle              || null),
        pocketbaseService.updateAppSetting('analyze_model',           analyzeModel          || null),
        pocketbaseService.updateAppSetting('plan_model',              planModel             || null),
        pocketbaseService.updateAppSetting('execute_model',           executeModel          || null),
        pocketbaseService.updateAppSetting('upload_model',            uploadModel           || null),
        pocketbaseService.updateAppSetting('report_model',            reportModel           || null),
        pocketbaseService.updateAppSetting('chunk_threshold',         chunkThreshold        || null),
        pocketbaseService.updateAppSetting('detail_level',            detailLevel           || null),
        pocketbaseService.updateAppSetting('report_detail',           reportDetail          || null),
        pocketbaseService.updateAppSetting('show_ingestion_schedule', showIngestionSchedule ? 'true' : null),
        pocketbaseService.updateAppSetting('show_enhance_prompt',      showEnhancePrompt     ? 'true' : null),
        pocketbaseService.updateAppSetting('dataset_describe_prompt',  datasetDescribePrompt || null),
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
    <div className="min-h-screen bg-gray-200 dark:bg-gray-950">
      <Navigation />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">App Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Settings set here apply to all users. Select "No selection" to let users choose their own.
        </p>

        <div className="space-y-6">

          {/* ── Default Model Overrides + Execute Plan Controls ── */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">

            {/* Section: App Branding */}
            <div className="px-6 py-5">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-4">
                App Branding
              </h2>
              <div className="flex items-center gap-4">
                <label className="w-52 text-sm text-gray-700 dark:text-gray-300 shrink-0">App Title</label>
                <input
                  type="text"
                  value={appTitle}
                  onChange={(e) => setAppTitle(e.target.value)}
                  placeholder="DataPilot"
                  className="input-field flex-1"
                  disabled={saveMutation.isPending}
                />
              </div>
            </div>

            {/* Section: Dataset Description */}
            <div className="px-6 py-5">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-4">
                Dataset Description
              </h2>
              <div className="flex items-center gap-4">
                <label className="w-52 text-sm text-gray-700 dark:text-gray-300 shrink-0">Prompt for AI description of dataset</label>
                <input
                  type="text"
                  value={datasetDescribePrompt}
                  onChange={(e) => setDatasetDescribePrompt(e.target.value)}
                  placeholder="e.g. Describe the columns, data types, and business context of this dataset"
                  className="input-field flex-1"
                  disabled={saveMutation.isPending}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2 ml-56">
                Used by "Have AI Describe Data" on the Edit Dataset Summary page.
              </p>
            </div>

            {/* Section: AI Models */}
            <div className="px-6 py-5">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-4">
                Default AI Models
              </h2>
              <div className="space-y-4">
                {[
                  { label: 'Analyze Page AI Model',          value: analyzeModel,  setter: setAnalyzeModel },
                  { label: 'Plan Report AI Model',           value: planModel,     setter: setPlanModel },
                  { label: 'Execute Report AI Model',        value: executeModel,  setter: setExecuteModel },
                  { label: 'Upload & Validate AI Model',     value: uploadModel,   setter: setUploadModel },
                  { label: 'Send Report & Formatter AI Model', value: reportModel, setter: setReportModel },
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
                  <select value={chunkThreshold} onChange={(e) => setChunkThreshold(e.target.value)} className="input-field flex-1" disabled={saveMutation.isPending}>
                    <option value="">No selection (user chooses)</option>
                    {CHUNK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-4">
                  <label className="w-52 text-sm text-gray-700 dark:text-gray-300 shrink-0">Detail Level</label>
                  <select value={reportDetail} onChange={(e) => setReportDetail(e.target.value)} className="input-field flex-1" disabled={saveMutation.isPending}>
                    <option value="">No selection (user chooses)</option>
                    {REPORT_DETAIL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-4">
                  <label className="w-52 text-sm text-gray-700 dark:text-gray-300 shrink-0">Show Steps</label>
                  <select value={detailLevel} onChange={(e) => setDetailLevel(e.target.value)} className="input-field flex-1" disabled={saveMutation.isPending}>
                    <option value="">No selection (user chooses)</option>
                    {SHOW_STEPS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Section: Feature Flags */}
            <div className="px-6 py-5">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-4">
                Feature Flags
              </h2>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="showIngestionSchedule"
                    checked={showIngestionSchedule}
                    onChange={(e) => setShowIngestionSchedule(e.target.checked)}
                    disabled={saveMutation.isPending}
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  <label htmlFor="showIngestionSchedule" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    Show "Manage Ingestion" link on Edit Dataset Summary page
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="showEnhancePrompt"
                    checked={showEnhancePrompt}
                    onChange={(e) => setShowEnhancePrompt(e.target.checked)}
                    disabled={saveMutation.isPending}
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  <label htmlFor="showEnhancePrompt" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    Show "Enhance Prompt" button on Plan &amp; Execute Report page
                  </label>
                </div>
              </div>
            </div>

            {/* Save button */}
            <div className="px-6 py-4 flex justify-end">
              <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="btn-primary">
                {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>

          {/* ── Nav Link Manager ── */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            <NavLinkManager />
          </div>

          {/* ── AI Model Manager ── */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            <AIModelManager />
          </div>

        </div>
      </div>
    </div>
  )
}
