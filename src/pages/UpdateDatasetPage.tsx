import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { n8nService } from '../services/mcpN8nService'
import { useAccessibleDatasets } from '../hooks/useAccessibleDatasets'
import Navigation from '../components/Navigation'

export default function UpdateDatasetPage() {
  const { session } = useSession()
  const [selectedDatasetId, setSelectedDatasetId] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [datasetSearch, setDatasetSearch] = useState('')
  const [csvPreview, setCsvPreview] = useState<string[]>([])
  const [datasetDesc, setDatasetDesc] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    datasets: datasets = [],
    isLoading: isLoadingDatasets,
    error: datasetsError,
  } = useAccessibleDatasets()

  const { data: datasetDetail } = useQuery({
    queryKey: ['dataset-detail', selectedDatasetId],
    queryFn: () => n8nService.getDatasetDetail(selectedDatasetId, session!.email),
    enabled: !!selectedDatasetId && !!session?.email,
  })

  useEffect(() => {
    setDatasetDesc(datasetDetail?.dataset_desc || '')
  }, [datasetDetail])

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !selectedDatasetId || !session) {
        throw new Error('Missing required data')
      }

      const fileContent = await readFileAsBase64(selectedFile)

      return n8nService.updateDataset({
        datasetId: selectedDatasetId,
        email: session.email,
        csvData: fileContent,
        fileName: selectedFile.name,
        datasetDesc: datasetDesc.trim() || undefined,
      })
    },
    onSuccess: (result) => {
      toast.success(result.message || 'Dataset updated successfully')
      setSelectedFile(null)
      setCsvPreview([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update dataset')
    },
  })

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      setSelectedFile(null)
      setCsvPreview([])
      return
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please select a CSV file')
      e.target.value = ''
      return
    }

    setSelectedFile(file)

    const text = await file.text()
    const lines = text.split('\n').slice(0, 6)
    setCsvPreview(lines)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedDatasetId) {
      toast.error('Please select a dataset')
      return
    }
    if (!selectedFile) {
      toast.error('Please select a CSV file')
      return
    }

    updateMutation.mutate()
  }

  const selectedDataset = datasets?.find((d) => d.id === selectedDatasetId)

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      <Navigation />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Update Dataset
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            This will replace all existing data in the selected dataset with the uploaded CSV file.
          </p>

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
                  Select Dataset to Update
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
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
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

              {selectedDataset && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Warning:</strong> Uploading a new CSV will replace all existing data in "{selectedDataset.name}".
                    This action cannot be undone.
                  </p>
                </div>
              )}

              {selectedDatasetId && (
                <div>
                  <label htmlFor="datasetDesc" className="label">
                    Explain the Data for AI (use Edit Summary to modify)
                  </label>
                  <textarea
                    id="datasetDesc"
                    value={datasetDesc}
                    readOnly
                    rows={3}
                    className="input-field resize-y bg-gray-50 dark:bg-gray-700/50 cursor-not-allowed"
                    placeholder="No description set"
                  />
                </div>
              )}

              <div>
                <label htmlFor="csvFile" className="label">
                  CSV File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  id="csvFile"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50 transition-colors duration-200"
                  disabled={updateMutation.isPending}
                />
                {selectedFile && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                  </p>
                )}
              </div>

              {csvPreview.length > 0 && (
                <div>
                  <label className="label">CSV Preview (first 5 rows)</label>
                  <div className="overflow-x-auto">
                    <pre className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md p-3 text-xs font-mono whitespace-pre overflow-x-auto max-h-48 text-gray-700 dark:text-gray-300">
                      {csvPreview.join('\n')}
                    </pre>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={updateMutation.isPending || !selectedDatasetId || !selectedFile}
                  className="btn-primary"
                >
                  {updateMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                      Uploading...
                    </span>
                  ) : (
                    'Upload & Update Dataset'
                  )}
                </button>

                {updateMutation.isPending && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    This may take a moment for large files...
                  </p>
                )}
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
