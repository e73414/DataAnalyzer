import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { n8nService } from '../services/mcpN8nService'
import Navigation from '../components/Navigation'

export default function UploadDatasetPage() {
  const { session } = useSession()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [datasetName, setDatasetName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [csvPreview, setCsvPreview] = useState<string[]>([])

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !session?.email) {
        throw new Error('Missing file or session')
      }

      const reader = new FileReader()
      const csvData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1]
          resolve(base64)
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(selectedFile)
      })

      return n8nService.uploadDataset({
        datasetName: datasetName || selectedFile.name.replace('.csv', ''),
        description,
        email: session.email,
        csvData,
      })
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['datasets'] })
      toast.success(`Dataset "${result.datasetName}" uploaded successfully! ${result.rowsInserted} rows inserted.`)
      setDatasetName('')
      setDescription('')
      setSelectedFile(null)
      setCsvPreview([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to upload dataset')
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      toast.error('Please select a CSV file')
      return
    }

    setSelectedFile(file)

    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const lines = text.split('\n').slice(0, 6)
      setCsvPreview(lines)
    }
    reader.readAsText(file)

    if (!datasetName) {
      setDatasetName(file.name.replace('.csv', ''))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile) {
      toast.error('Please select a CSV file')
      return
    }
    uploadMutation.mutate()
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      <Navigation />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            Upload a New Dataset
          </h2>

          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">How it works:</h3>
            <ul className="text-sm text-blue-700 dark:text-blue-300 list-disc list-inside space-y-1">
              <li>Upload a CSV file with headers in the first row</li>
              <li>The system will automatically detect column types</li>
              <li>AI will analyze your data and generate a summary</li>
              <li>You can edit the summary later from the Edit Summary page</li>
            </ul>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="datasetName" className="label">
                Dataset Name
              </label>
              <input
                type="text"
                id="datasetName"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                className="input-field"
                placeholder="Enter dataset name (optional - defaults to filename)"
                disabled={uploadMutation.isPending}
              />
            </div>

            <div>
              <label htmlFor="description" className="label">
                Description (Optional)
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="input-field resize-y"
                placeholder="Describe your dataset... (leave blank for AI-generated summary)"
                disabled={uploadMutation.isPending}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                If left blank, AI will automatically generate a summary based on your data
              </p>
            </div>

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
                disabled={uploadMutation.isPending}
              />
            </div>

            {selectedFile && (
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(selectedFile.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null)
                      setCsvPreview([])
                      if (fileInputRef.current) {
                        fileInputRef.current.value = ''
                      }
                    }}
                    className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                    disabled={uploadMutation.isPending}
                  >
                    Remove
                  </button>
                </div>

                {csvPreview.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Preview (first 5 rows):</p>
                    <div className="overflow-x-auto">
                      <pre className="text-xs font-mono bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-600 rounded whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                        {csvPreview.join('\n')}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={uploadMutation.isPending || !selectedFile}
                className="btn-primary"
              >
                {uploadMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                    Uploading & Processing...
                  </span>
                ) : (
                  'Upload Dataset'
                )}
              </button>
            </div>

            {uploadMutation.isPending && (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Processing your dataset... This may take a few minutes for large files as AI analyzes your data.
                </p>
              </div>
            )}
          </form>
        </div>
      </main>
    </div>
  )
}
