import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { n8nService } from '../services/mcpN8nService'
import { useAccessibleDatasets } from '../hooks/useAccessibleDatasets'
import Navigation from '../components/Navigation'

export default function DeleteDatasetPage() {
  const queryClient = useQueryClient()
  const { session } = useSession()
  const [selectedDatasetId, setSelectedDatasetId] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [datasetSearch, setDatasetSearch] = useState('')

  const {
    datasets: datasets = [],
    isLoading: isLoadingDatasets,
    error: datasetsError,
  } = useAccessibleDatasets()

  const deleteMutation = useMutation({
    mutationFn: () =>
      n8nService.deleteDataset({
        datasetId: selectedDatasetId,
        email: session!.email,
      }),
    onSuccess: (result) => {
      toast.success(`Dataset "${result.datasetName}" deleted successfully`)
      setSelectedDatasetId('')
      setConfirmText('')
      queryClient.invalidateQueries({ queryKey: ['datasets'] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete dataset')
    },
  })

  const selectedDataset = datasets?.find((d) => d.id === selectedDatasetId)
  const isConfirmValid = confirmText === 'DELETE'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDatasetId || !isConfirmValid) return
    deleteMutation.mutate()
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      <Navigation />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            Delete Dataset
          </h2>

          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <h3 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">Warning: This action is permanent</h3>
            <ul className="text-sm text-red-700 dark:text-red-300 list-disc list-inside space-y-1">
              <li>All data rows in the dataset will be deleted</li>
              <li>The dataset metadata and summary will be removed</li>
              <li>Any associated vector embeddings will be deleted</li>
              <li>This action cannot be undone</li>
            </ul>
          </div>

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
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="dataset" className="label">
                  Select Dataset to Delete
                </label>
                <input
                  type="text"
                  value={datasetSearch}
                  onChange={(e) => setDatasetSearch(e.target.value)}
                  placeholder="Search datasets..."
                  className="input-field mb-2"
                  disabled={deleteMutation.isPending}
                />
                <select
                  id="dataset"
                  value={selectedDatasetId}
                  onChange={(e) => {
                    setSelectedDatasetId(e.target.value)
                    setConfirmText('')
                  }}
                  className="input-field focus:ring-red-500 focus:border-red-500"
                  disabled={deleteMutation.isPending}
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

              {selectedDataset && (
                <>
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Selected Dataset:</h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Name:</strong> {selectedDataset.name}
                    </p>
                    {selectedDataset.description && (
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        <strong>Description:</strong> {selectedDataset.description}
                      </p>
                    )}
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      ID: {selectedDataset.id}
                    </p>
                  </div>

                  <div>
                    <label htmlFor="confirm" className="label">
                      Type <span className="font-bold text-red-600 dark:text-red-400">DELETE</span> to confirm
                    </label>
                    <input
                      type="text"
                      id="confirm"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      className="input-field focus:ring-red-500 focus:border-red-500"
                      placeholder="Type DELETE to confirm"
                      disabled={deleteMutation.isPending}
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <button
                      type="submit"
                      disabled={deleteMutation.isPending || !isConfirmValid}
                      className="btn-danger"
                    >
                      {deleteMutation.isPending ? (
                        <span className="flex items-center gap-2">
                          <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                          Deleting...
                        </span>
                      ) : (
                        'Delete Dataset'
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDatasetId('')
                        setConfirmText('')
                      }}
                      disabled={deleteMutation.isPending}
                      className="btn-secondary disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
