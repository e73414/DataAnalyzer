import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import { n8nService } from '../services/mcpN8nService'
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

  const {
    data: datasets,
    isLoading: isLoadingDatasets,
    error: datasetsError,
  } = useQuery({
    queryKey: ['datasets', session?.email],
    queryFn: () => pocketbaseService.getDatasetsByEmail(session!.email),
    enabled: !!session?.email,
  })

  const {
    data: datasetDetail,
    isLoading: isLoadingDetail,
    error: detailError,
  } = useQuery({
    queryKey: ['dataset-detail', selectedDatasetId],
    queryFn: () => n8nService.getDatasetDetail(selectedDatasetId, session!.email),
    enabled: !!selectedDatasetId && !!session?.email,
  })

  const updateMutation = useMutation({
    mutationFn: (data: { summary: string; datasetDesc: string; datasetName: string }) =>
      n8nService.updateSummary({
        datasetId: selectedDatasetId,
        summary: data.summary,
        email: session!.email,
        datasetDesc: data.datasetDesc,
        datasetName: data.datasetName,
      }),
    onSuccess: () => {
      toast.success('Dataset updated successfully')
      queryClient.invalidateQueries({ queryKey: ['dataset-detail', selectedDatasetId] })
      queryClient.invalidateQueries({ queryKey: ['datasets', session?.email] })
      navigate('/analyze', { state: { preSelectedDatasetId: selectedDatasetId } })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update summary')
    },
  })

  useEffect(() => {
    if (datasetDetail) {
      setDatasetName(datasetDetail.name || '')
      setEditedSummary(datasetDetail.summary || '')
      setDatasetDesc(datasetDetail.dataset_desc || '')
      setHasChanges(false)
    }
  }, [datasetDetail])

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
    setHasChanges(false)
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
    updateMutation.mutate({ summary: editedSummary, datasetDesc: datasetDesc.trim(), datasetName: datasetName.trim() })
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
      const header = preview.columns.map(escape).join(',')
      const dataRows = preview.rows.map(row =>
        preview.columns.map(col => escape(String(row[col] ?? ''))).join(',')
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
                        <label className="label">
                          Column Mapping (Read-only)
                        </label>
                        <pre className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md text-sm font-mono whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                          {formatColumnMapping(datasetDetail.column_mapping)}
                        </pre>
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
                        <label htmlFor="summary" className="label">
                          Summary
                          {hasChanges && (
                            <span className="ml-2 text-orange-500 dark:text-orange-400 text-xs">(unsaved changes)</span>
                          )}
                        </label>
                        <textarea
                          id="summary"
                          value={editedSummary}
                          onChange={(e) => handleSummaryChange(e.target.value)}
                          rows={10}
                          className="input-field resize-y font-mono text-sm"
                          placeholder="Enter dataset summary..."
                          disabled={updateMutation.isPending}
                        />
                      </div>

                      <div className="flex items-center gap-4">
                        <button
                          type="submit"
                          disabled={updateMutation.isPending || !hasChanges}
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
                          }}
                          disabled={updateMutation.isPending || !hasChanges}
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
