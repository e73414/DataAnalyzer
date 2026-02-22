import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import { n8nService } from '../services/mcpN8nService'
import Navigation from '../components/Navigation'
import type { DatasetDetail } from '../types'

export default function EditSummaryPage() {
  const queryClient = useQueryClient()
  const { session } = useSession()
  const [selectedDatasetId, setSelectedDatasetId] = useState('')
  const [editedSummary, setEditedSummary] = useState('')
  const [datasetDesc, setDatasetDesc] = useState('')
  const [hasChanges, setHasChanges] = useState(false)

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
    mutationFn: (data: { summary: string; datasetDesc: string }) =>
      n8nService.updateSummary({
        datasetId: selectedDatasetId,
        summary: data.summary,
        email: session!.email,
        datasetDesc: data.datasetDesc,
      }),
    onSuccess: () => {
      toast.success('Summary updated successfully')
      setHasChanges(false)
      queryClient.invalidateQueries({ queryKey: ['dataset-detail', selectedDatasetId] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update summary')
    },
  })

  useEffect(() => {
    if (datasetDetail) {
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
    setEditedSummary('')
    setDatasetDesc('')
    setHasChanges(false)
  }

  const handleSummaryChange = (value: string) => {
    setEditedSummary(value)
    setHasChanges(value !== (datasetDetail?.summary || '') || datasetDesc !== (datasetDetail?.dataset_desc || ''))
  }

  const handleDatasetDescChange = (value: string) => {
    setDatasetDesc(value)
    setHasChanges(editedSummary !== (datasetDetail?.summary || '') || value !== (datasetDetail?.dataset_desc || ''))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editedSummary.trim()) {
      toast.error('Summary cannot be empty')
      return
    }
    updateMutation.mutate({ summary: editedSummary, datasetDesc: datasetDesc.trim() })
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
                <select
                  id="dataset"
                  value={selectedDatasetId}
                  onChange={(e) => handleDatasetChange(e.target.value)}
                  className="input-field"
                  disabled={updateMutation.isPending}
                >
                  <option value="">-- Select a dataset --</option>
                  {datasets?.map((dataset) => (
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
                            setEditedSummary(datasetDetail.summary || '')
                            setDatasetDesc(datasetDetail.dataset_desc || '')
                            setHasChanges(false)
                          }}
                          disabled={updateMutation.isPending || !hasChanges}
                          className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Reset
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
