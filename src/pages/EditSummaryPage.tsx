import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { n8nService } from '../services/mcpN8nService'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import { ProfilePicker, composeProfile } from '../components/ProfilePicker'
import { useAccessibleDatasets } from '../hooks/useAccessibleDatasets'
import Navigation from '../components/Navigation'
import type { DatasetDetail } from '../types'

export default function EditSummaryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { session } = useSession()
  const [selectedDatasetId, setSelectedDatasetId] = useState('')
  const [datasetSearch, setDatasetSearch] = useState('')
  const [datasetName, setDatasetName] = useState('')
  const [editedSummary, setEditedSummary] = useState('')
  const [datasetDesc, setDatasetDesc] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [sampleQuestions, setSampleQuestions] = useState<{ id: string; question: string }[]>([])
  const [newQuestion, setNewQuestion] = useState('')
  const [columnMappingExpanded, setColumnMappingExpanded] = useState(false)
  const [summaryTab, setSummaryTab] = useState<'edit' | 'preview'>('preview')
  const summaryTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [datasetProfileCompanyCode, setDatasetProfileCompanyCode] = useState('')
  const [datasetProfileBuCode, setDatasetProfileBuCode] = useState('')
  const [datasetProfileTeamCode, setDatasetProfileTeamCode] = useState('')

  const [profileChanged, setProfileChanged] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const {
    datasets: datasets = [],
    isLoading: isLoadingDatasets,
    error: datasetsError,
  } = useAccessibleDatasets()

  const {
    data: datasetDetail,
    isLoading: isLoadingDetail,
    error: detailError,
  } = useQuery({
    queryKey: ['dataset-detail', selectedDatasetId],
    queryFn: () => n8nService.getDatasetDetail(selectedDatasetId, session!.email),
    enabled: !!selectedDatasetId && !!session?.email,
  })

  const sampleQuestionsMutation = useMutation({
    mutationFn: (questions: { id: string; question: string }[]) =>
      pocketbaseService.updateSampleQuestions(selectedDatasetId, questions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dataset-detail', selectedDatasetId] })
    },
    onError: () => toast.error('Failed to update sample questions'),
  })

  const updateMutation = useMutation({
    mutationFn: async (data: { summary: string; datasetDesc: string; datasetName: string; profileCode?: string | null }) => {
      await n8nService.updateSummary({
        datasetId: selectedDatasetId,
        summary: data.summary,
        email: session!.email,
        datasetDesc: data.datasetDesc,
        datasetName: data.datasetName,
      })
      if (data.profileCode !== undefined) {
        await pocketbaseService.setTemplateProfile(selectedDatasetId, data.profileCode)
      }
    },
    onSuccess: () => {
      setProfileChanged(false)
      toast.success('Dataset updated successfully')
      queryClient.invalidateQueries({ queryKey: ['dataset-detail', selectedDatasetId] })
      queryClient.invalidateQueries({ queryKey: ['datasets', session?.email] })
      navigate('/analyze', { state: { preSelectedDatasetId: selectedDatasetId } })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update summary')
    },
  })

  const profileMutation = useMutation({
    mutationFn: (profileCode: string | null) =>
      pocketbaseService.setTemplateProfile(selectedDatasetId, profileCode),
    onSuccess: () => {
      setProfileChanged(false)
      toast.success('Dataset access updated')
      queryClient.invalidateQueries({ queryKey: ['datasets'] })
      queryClient.invalidateQueries({ queryKey: ['dataset-detail', selectedDatasetId] })
    },
    onError: () => toast.error('Failed to update dataset access'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => n8nService.deleteDataset({ datasetId: selectedDatasetId, email: session!.email }),
    onSuccess: (result) => {
      toast.success(`"${result.datasetName}" deleted`)
      queryClient.invalidateQueries({ queryKey: ['datasets'] })
      navigate('/edit-summary')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to delete dataset'),
  })

  useEffect(() => {
    if (datasetDetail) {
      setDatasetName(datasetDetail.name || '')
      setEditedSummary(datasetDetail.summary || '')
      setDatasetDesc(datasetDetail.dataset_desc || '')
      setSampleQuestions(datasetDetail.sample_questions?.questions ?? [])
      setHasChanges(false)
    }
  }, [datasetDetail])

  // profile_code lives on the dataset list (from GET /datasets JOIN template_profiles),
  // not on getDatasetDetail — initialize profile pickers from datasets list
  useEffect(() => {
    if (!selectedDatasetId) return
    const selectedDataset = datasets.find(d => d.id === selectedDatasetId)
    const code = selectedDataset?.profile_code?.trim() || ''
    if (code && code !== 'admadmadm') {
      setDatasetProfileCompanyCode(code.slice(0, 3).trim() === '000' ? '' : code.slice(0, 3).trim())
      setDatasetProfileBuCode(code.slice(3, 6).trim() === '000' ? '' : code.slice(3, 6).trim())
      setDatasetProfileTeamCode(code.slice(6, 9).trim() === '000' ? '' : code.slice(6, 9).trim())
    } else {
      setDatasetProfileCompanyCode('')
      setDatasetProfileBuCode('')
      setDatasetProfileTeamCode('')
    }
    setProfileChanged(false)
  }, [selectedDatasetId, datasets])

  const handleDatasetChange = (datasetId: string) => {
    if (hasChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to switch datasets?')) {
        return
      }
    }
    setSelectedDatasetId(datasetId)
    setDatasetName('')
    setEditedSummary('')
    setDatasetDesc('')
    setSampleQuestions([])
    setNewQuestion('')
    setHasChanges(false)
    setProfileChanged(false)
    setConfirmDelete(false)
    setDatasetProfileCompanyCode('')
    setDatasetProfileBuCode('')
    setDatasetProfileTeamCode('')
  }

  const checkHasChanges = (name: string, summary: string, desc: string) =>
    name !== (datasetDetail?.name || '') ||
    summary !== (datasetDetail?.summary || '') ||
    desc !== (datasetDetail?.dataset_desc || '')

  const handleDatasetNameChange = (value: string) => {
    setDatasetName(value)
    setHasChanges(checkHasChanges(value, editedSummary, datasetDesc))
  }

  const handleSummaryChange = (value: string) => {
    setEditedSummary(value)
    setHasChanges(checkHasChanges(datasetName, value, datasetDesc))
  }

  const handleDatasetDescChange = (value: string) => {
    setDatasetDesc(value)
    setHasChanges(checkHasChanges(datasetName, editedSummary, value))
  }

  const handleAddQuestion = () => {
    const text = newQuestion.trim()
    if (!text) return
    const updated = [...sampleQuestions, { id: crypto.randomUUID(), question: text }]
    setSampleQuestions(updated)
    setNewQuestion('')
    sampleQuestionsMutation.mutate(updated)
  }

  const handleDeleteQuestion = (id: string) => {
    const updated = sampleQuestions.filter(q => q.id !== id)
    setSampleQuestions(updated)
    sampleQuestionsMutation.mutate(updated)
  }

  const insertMarkdown = (prefix: string, suffix = '') => {
    const ta = summaryTextareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = editedSummary.slice(start, end)
    handleSummaryChange(editedSummary.slice(0, start) + prefix + selected + suffix + editedSummary.slice(end))
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + prefix.length, end + prefix.length) }, 0)
  }

  const insertLinePrefix = (prefix: string) => {
    const ta = summaryTextareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const lineStart = editedSummary.lastIndexOf('\n', start - 1) + 1
    handleSummaryChange(editedSummary.slice(0, lineStart) + prefix + editedSummary.slice(lineStart))
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + prefix.length, start + prefix.length) }, 0)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!datasetName.trim()) {
      toast.error('Dataset title cannot be empty')
      return
    }
    if (!editedSummary.trim()) {
      toast.error('Summary cannot be empty')
      return
    }
    const profileCode = profileChanged
      ? (datasetProfileCompanyCode ? composeProfile(datasetProfileCompanyCode, datasetProfileBuCode, datasetProfileTeamCode) : null)
      : undefined
    updateMutation.mutate({ summary: editedSummary, datasetDesc: datasetDesc.trim(), datasetName: datasetName.trim(), profileCode })
  }

  const handleDownloadCsv = async () => {
    if (!selectedDatasetId || !session?.email) return
    setIsDownloading(true)
    try {
      const preview = await n8nService.getDatasetPreview(selectedDatasetId, session.email, 99999)
      const escape = (val: string) => {
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`
        }
        return val
      }
      // Build db→original mapping so headers use original column names from the view
      const columnMapping = (() => {
        if (!datasetDetail?.column_mapping) return {} as Record<string, string>
        if (typeof datasetDetail.column_mapping === 'string') {
          try { return JSON.parse(datasetDetail.column_mapping) as Record<string, string> } catch { return {} as Record<string, string> }
        }
        return datasetDetail.column_mapping as Record<string, string>
      })()
      const dbToOriginal: Record<string, string> = {}
      Object.entries(columnMapping).forEach(([orig, db]) => { dbToOriginal[db] = orig })
      const columns = Object.keys(dbToOriginal).length > 0
        ? preview.columns.filter(col => dbToOriginal[col])
        : preview.columns
      const header = columns.map(col => escape(dbToOriginal[col] ?? col)).join(',')
      const dataRows = preview.rows.map(row =>
        columns.map(col => escape(String(row[col] ?? ''))).join(',')
      )
      const csv = [header, ...dataRows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${datasetName || selectedDatasetId}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download CSV')
    } finally {
      setIsDownloading(false)
    }
  }

  const formatColumnMapping = (mapping: DatasetDetail['column_mapping']): string => {
    if (!mapping) return 'No column mapping available'
    if (typeof mapping === 'string') {
      try {
        const parsed = JSON.parse(mapping)
        return Object.entries(parsed)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n')
      } catch {
        return mapping
      }
    }
    return Object.entries(mapping)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n')
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      <Navigation />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            Edit Dataset Summary
          </h2>

          {isLoadingDatasets ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading datasets...</p>
            </div>
          ) : datasetsError ? (
            <div className="text-center py-12">
              <p className="text-red-600 dark:text-red-400">
                Failed to load datasets: {datasetsError instanceof Error ? datasetsError.message : 'Unknown error'}
              </p>
            </div>
          ) : datasets?.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">No datasets found for your email address.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <label htmlFor="dataset" className="label">
                  Select Dataset
                </label>
                <input
                  type="text"
                  value={datasetSearch}
                  onChange={(e) => setDatasetSearch(e.target.value)}
                  placeholder="Search datasets..."
                  className="input-field mb-2"
                  disabled={updateMutation.isPending}
                />
                <select
                  id="dataset"
                  value={selectedDatasetId}
                  onChange={(e) => handleDatasetChange(e.target.value)}
                  className="input-field"
                  disabled={updateMutation.isPending}
                >
                  <option value="">-- Select a dataset --</option>
                  {[...(datasets ?? [])].sort((a, b) => a.name.localeCompare(b.name)).filter(d => d.name.toLowerCase().includes(datasetSearch.toLowerCase())).map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.name}
                      {dataset.description && ` - ${dataset.description}`}
                    </option>
                  ))}
                </select>
              </div>

              {selectedDatasetId && (
                <>
                  {isLoadingDetail ? (
                    <div className="text-center py-8">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-4 border-blue-500 border-t-transparent"></div>
                      <p className="mt-2 text-gray-600 dark:text-gray-400">Loading dataset details...</p>
                    </div>
                  ) : detailError ? (
                    <div className="text-center py-4">
                      <p className="text-red-600 dark:text-red-400">
                        Failed to load dataset details: {detailError instanceof Error ? detailError.message : 'Unknown error'}
                      </p>
                    </div>
                  ) : datasetDetail ? (
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div>
                        <label htmlFor="datasetTitle" className="label">
                          Dataset Title
                        </label>
                        <input
                          id="datasetTitle"
                          type="text"
                          value={datasetName}
                          onChange={(e) => handleDatasetNameChange(e.target.value)}
                          className="input-field"
                          placeholder="Enter dataset title..."
                          disabled={updateMutation.isPending}
                        />
                      </div>

                      <div>
                        <button
                          type="button"
                          onClick={() => setColumnMappingExpanded(v => !v)}
                          className="flex items-center gap-1.5 label mb-0 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <span className="text-xs">{columnMappingExpanded ? '▾' : '▸'}</span>
                          Column Mapping (Read-only)
                        </button>
                        {columnMappingExpanded && (
                          <pre className="mt-2 w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md text-sm font-mono whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                            {formatColumnMapping(datasetDetail.column_mapping)}
                          </pre>
                        )}
                      </div>

                      <div>
                        <label htmlFor="datasetDesc" className="label">
                          Explain the Data for AI
                        </label>
                        <textarea
                          id="datasetDesc"
                          value={datasetDesc}
                          onChange={(e) => handleDatasetDescChange(e.target.value)}
                          rows={3}
                          className="input-field resize-y"
                          placeholder="Provide context about your data to help AI understand it better (e.g., what the columns represent, time periods, business context...)"
                          disabled={updateMutation.isPending}
                        />
                      </div>

                      <div>
                        <label className="label">Sample Questions</label>
                        {sampleQuestions.length > 0 && (
                          <ul className="mb-3 space-y-1.5">
                            {sampleQuestions.map(q => (
                              <li key={q.id} className="flex items-start justify-between gap-3 text-sm text-gray-700 dark:text-gray-300">
                                <span className="flex-1"><span className="mr-1.5 text-gray-400">•</span>{q.question}</span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteQuestion(q.id)}
                                  disabled={sampleQuestionsMutation.isPending}
                                  className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 shrink-0 disabled:opacity-50"
                                >
                                  Delete
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newQuestion}
                            onChange={(e) => setNewQuestion(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddQuestion() } }}
                            placeholder="Add a sample question..."
                            className="input-field flex-1"
                            disabled={sampleQuestionsMutation.isPending || updateMutation.isPending}
                          />
                          <button
                            type="button"
                            onClick={handleAddQuestion}
                            disabled={!newQuestion.trim() || sampleQuestionsMutation.isPending || updateMutation.isPending}
                            className="btn-primary shrink-0"
                          >
                            Add
                          </button>
                        </div>
                      </div>

                      {(() => {
                        const ownerEmail = datasets.find(d => d.id === selectedDatasetId)?.owner_email
                        const canChangeProfile = session?.profile?.trim() === 'admadmadm' || ownerEmail === session?.email
                        if (!canChangeProfile) return null
                        const handleSaveProfile = () => {
                          const chosenProfile = datasetProfileCompanyCode
                            ? composeProfile(datasetProfileCompanyCode, datasetProfileBuCode, datasetProfileTeamCode)
                            : null
                          profileMutation.mutate(chosenProfile)
                        }
                        return (
                          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                              <label className="label mb-0">Dataset Access</label>
                              <button
                                type="button"
                                onClick={handleSaveProfile}
                                disabled={profileMutation.isPending}
                                className="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                              >
                                {profileMutation.isPending ? 'Saving…' : 'Update Access'}
                              </button>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                              Leave company blank to keep private. Assign a profile to share with users.
                            </p>
                            <ProfilePicker
                              companyCode={datasetProfileCompanyCode}
                              buCode={datasetProfileBuCode}
                              teamCode={datasetProfileTeamCode}
                              onChange={(c, b, t) => { setDatasetProfileCompanyCode(c); setDatasetProfileBuCode(b); setDatasetProfileTeamCode(t); setProfileChanged(true) }}
                            />
                          </div>
                        )
                      })()}

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="label mb-0">
                            Summary
                            {hasChanges && (
                              <span className="ml-2 text-orange-500 dark:text-orange-400 text-xs">(unsaved changes)</span>
                            )}
                          </label>
                          <div className="flex rounded border border-gray-200 dark:border-gray-600 overflow-hidden text-xs">
                            <button type="button" onClick={() => setSummaryTab('edit')}
                              className={`px-3 py-1 ${summaryTab === 'edit' ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>
                              Edit
                            </button>
                            <button type="button" onClick={() => setSummaryTab('preview')}
                              className={`px-3 py-1 ${summaryTab === 'preview' ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>
                              Preview
                            </button>
                          </div>
                        </div>
                        {summaryTab === 'edit' ? (
                          <>
                            <div className="flex flex-wrap gap-1 p-1.5 bg-gray-50 dark:bg-gray-700/50 border border-b-0 border-gray-200 dark:border-gray-600 rounded-t-md">
                              {[
                                { label: 'B', title: 'Bold', cls: 'font-bold', action: () => insertMarkdown('**', '**') },
                                { label: 'I', title: 'Italic', cls: 'italic', action: () => insertMarkdown('*', '*') },
                              ].map(btn => (
                                <button key={btn.label} type="button" title={btn.title} onClick={btn.action}
                                  className={`px-2 py-0.5 text-sm ${btn.cls} rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200`}>
                                  {btn.label}
                                </button>
                              ))}
                              <span className="w-px bg-gray-300 dark:bg-gray-600 my-0.5" />
                              {['H1', 'H2', 'H3'].map((h, i) => (
                                <button key={h} type="button" title={h} onClick={() => insertLinePrefix('#'.repeat(i + 1) + ' ')}
                                  className="px-2 py-0.5 text-xs rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200">
                                  {h}
                                </button>
                              ))}
                              <span className="w-px bg-gray-300 dark:bg-gray-600 my-0.5" />
                              <button type="button" title="Bullet list" onClick={() => insertLinePrefix('- ')}
                                className="px-2 py-0.5 text-xs rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200">
                                • List
                              </button>
                              <button type="button" title="Numbered list" onClick={() => insertLinePrefix('1. ')}
                                className="px-2 py-0.5 text-xs rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200">
                                1. List
                              </button>
                            </div>
                            <textarea
                              ref={summaryTextareaRef}
                              id="summary"
                              value={editedSummary}
                              onChange={(e) => handleSummaryChange(e.target.value)}
                              rows={10}
                              className="input-field resize-y font-mono text-sm rounded-t-none border-t-0"
                              placeholder="Enter dataset summary..."
                              disabled={updateMutation.isPending}
                            />
                          </>
                        ) : (
                          <div className="w-full min-h-48 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                            {editedSummary
                              ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{editedSummary}</ReactMarkdown>
                              : <p className="text-gray-400 dark:text-gray-500 italic">Nothing to preview</p>
                            }
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        <button
                          type="submit"
                          disabled={updateMutation.isPending || (!hasChanges && !profileChanged)}
                          className="btn-primary"
                        >
                          {updateMutation.isPending ? (
                            <span className="flex items-center gap-2">
                              <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                              Saving...
                            </span>
                          ) : (
                            'Save Changes'
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setDatasetName(datasetDetail.name || '')
                            setEditedSummary(datasetDetail.summary || '')
                            setDatasetDesc(datasetDetail.dataset_desc || '')
                            setHasChanges(false)
                            const code = datasets.find(d => d.id === selectedDatasetId)?.profile_code?.trim() || ''
                            setDatasetProfileCompanyCode(code.slice(0, 3).trim() === '000' ? '' : code.slice(0, 3).trim())
                            setDatasetProfileBuCode(code.slice(3, 6).trim() === '000' ? '' : code.slice(3, 6).trim())
                            setDatasetProfileTeamCode(code.slice(6, 9).trim() === '000' ? '' : code.slice(6, 9).trim())
                            setProfileChanged(false)
                          }}
                          disabled={updateMutation.isPending || (!hasChanges && !profileChanged)}
                          className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Reset
                        </button>

                        <button
                          type="button"
                          onClick={handleDownloadCsv}
                          disabled={isDownloading || updateMutation.isPending}
                          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isDownloading ? (
                            <span className="flex items-center gap-2">
                              <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-gray-500 border-t-transparent"></span>
                              Downloading...
                            </span>
                          ) : (
                            'Download CSV'
                          )}
                        </button>

                        {(session?.profile?.trim() === 'admadmadm' || datasets.find(d => d.id === selectedDatasetId)?.owner_email === session?.email) && (
                          confirmDelete ? (
                            <span className="flex items-center gap-2">
                              <span className="text-sm text-gray-600 dark:text-gray-400">Delete this dataset?</span>
                              <button
                                type="button"
                                onClick={() => deleteMutation.mutate()}
                                disabled={deleteMutation.isPending}
                                className="px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
                              >
                                {deleteMutation.isPending ? 'Deleting…' : 'Yes, Delete'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(false)}
                                disabled={deleteMutation.isPending}
                                className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(true)}
                              disabled={updateMutation.isPending}
                              className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-200 disabled:opacity-50"
                            >
                              Delete Dataset
                            </button>
                          )
                        )}
                      </div>
                    </form>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
