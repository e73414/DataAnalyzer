import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { useAppSettings } from '../context/AppSettingsContext'
import { n8nService } from '../services/mcpN8nService'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import { ProfilePicker, composeProfile } from '../components/ProfilePicker'
import Navigation from '../components/Navigation'
import HelpTip from '../components/HelpTip'

interface IncomingFileState {
  csvFile?: File
  fileName?: string
  ingestionConfig?: {
    source_type: 'excel' | 'csv'
    config: {
      sheets?: Array<{ name: string; header_row?: string; excluded_col_names?: string[] }>
      no_unpivot?: boolean
      keep_dupes?: boolean
    }
  }
  sourceInfo?: {
    location_type: string
    folder_id: string
    schedule: string | null
  }
}

export default function UploadDatasetPage() {
  const { session } = useSession()
  const { appSettings } = useAppSettings()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const location = useLocation()
  const loadedRef = useRef(false)

  const [datasetName, setDatasetName] = useState('')
  const [description, setDescription] = useState('')
  const [datasetDesc, setDatasetDesc] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [csvPreview, setCsvPreview] = useState<string[]>([])
  const [selectedProfileCode, setSelectedProfileCode] = useState('')
  const [datasetProfileCompanyCode, setDatasetProfileCompanyCode] = useState('')
  const [datasetProfileBuCode, setDatasetProfileBuCode] = useState('')
  const [datasetProfileTeamCode, setDatasetProfileTeamCode] = useState('')

  // Accept pre-populated file from CSV Optimizer
  useEffect(() => {
    if (loadedRef.current) return
    const state = location.state as IncomingFileState | null
    if (state?.csvFile) {
      loadedRef.current = true
      setSelectedFile(state.csvFile)
      if (state.fileName) {
        setDatasetName(state.fileName)
      }
      // Generate preview from the file
      state.csvFile.text().then(text => {
        const lines = text.split('\n').slice(0, 6)
        setCsvPreview(lines)
      })
    }
  }, [location.state])

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

      const result = await n8nService.uploadDataset({
        datasetName: datasetName || selectedFile.name.replace('.csv', ''),
        description,
        email: session.email,
        csvData,
        ...(datasetDesc.trim() && { datasetDesc: datasetDesc.trim() }),
        ...(appSettings?.upload_model && { model: appSettings.upload_model }),
      })

      const isAdmin = session.profile?.trim() === 'admadmadm'
      const chosenProfile = isAdmin
        ? (datasetProfileCompanyCode
            ? composeProfile(datasetProfileCompanyCode, datasetProfileBuCode, datasetProfileTeamCode)
            : null)
        : (selectedProfileCode || null)

      if (chosenProfile && result.datasetId) {
        await pocketbaseService.setTemplateProfile(result.datasetId, chosenProfile)
      }

      return result
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['datasets'] })
      // Save ingestion config if it was passed from CSV Optimizer PLUS
      const state = location.state as IncomingFileState | null
      if (state?.ingestionConfig && result.datasetId) {
        try {
          await pocketbaseService.saveIngestionConfig({ dataset_id: result.datasetId, ...state.ingestionConfig })
        } catch {
          // Non-fatal — config can be saved later from the ingestion schedule page
        }
      }
      if (state?.sourceInfo && result.datasetId && session?.email) {
        try {
          await pocketbaseService.saveIngestionSchedule({
            dataset_id: result.datasetId,
            owner_email: session.email,
            folder_id: state.sourceInfo.folder_id,
            location_type: state.sourceInfo.location_type,
            schedule: state.sourceInfo.schedule,
            enabled: true,
          })
          await pocketbaseService.logIngestionFile({
            dataset_id: result.datasetId,
            file_name: result.datasetName,
            file_location: state.sourceInfo.folder_id,
            location_type: state.sourceInfo.location_type,
            ingestion_result: 'success',
            rows_inserted: result.rowsInserted,
          })
        } catch {
          // Non-fatal — schedule can be set from the ingestion schedule page
        }
      }
      toast.success(`Dataset "${result.datasetName}" uploaded successfully! ${result.rowsInserted} rows inserted.`)
      navigate('/edit-summary', { state: { preSelectedDatasetId: result.datasetId, autoEnrich: true } })
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
    <div className="min-h-screen bg-gray-200 dark:bg-gray-950 transition-colors duration-200">
      <Navigation />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Upload Dataset</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Add a new dataset to your library for AI-powered analysis.</p>
        </div>
        <div className="card p-6">
          <div className="mb-6 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
            <h3 className="text-sm font-medium text-purple-800 dark:text-purple-200 mb-2">How it works:</h3>
            <ul className="text-sm text-purple-700 dark:text-purple-300 list-disc list-inside space-y-1">
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
              <label htmlFor="datasetDesc" className="label flex items-center gap-1.5">
                Explain the Data for AI
                <HelpTip text="Provide business context so AI generates more accurate queries." />
              </label>
              <textarea
                id="datasetDesc"
                value={datasetDesc}
                onChange={(e) => setDatasetDesc(e.target.value)}
                rows={3}
                className="input-field resize-y"
                placeholder="Provide context about your data to help AI understand it better (e.g., what the columns represent, time periods, business context...)"
                disabled={uploadMutation.isPending}
              />
            </div>

            <div>
              <label htmlFor="description" className="label flex items-center gap-1.5">
                Instruct AI How to Build Query
                <HelpTip text="Provide instructions or guidelines to help AI understand your analysis needs." />
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-purple-50 dark:file:bg-purple-900/30 file:text-purple-700 dark:file:text-purple-300 hover:file:bg-purple-100 dark:hover:file:bg-purple-900/50 transition-colors duration-200"
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

            {(() => {
              const isAdmin = session?.profile?.trim() === 'admadmadm'
              const userProfiles = session?.profiles ?? []
              if (!isAdmin && userProfiles.length > 0) {
                return (
                  <div>
                    <label className="label flex items-center gap-1.5">
                      Dataset Access
                      <HelpTip text="Control who can access this dataset. Private keeps it for your use only." />
                    </label>
                    <select
                      className="input-field"
                      value={selectedProfileCode}
                      onChange={(e) => setSelectedProfileCode(e.target.value)}
                      disabled={uploadMutation.isPending}
                    >
                      <option value="">Private (only me)</option>
                      {userProfiles.map(p => (
                        <option key={p} value={p}>{p.trim()}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Select a profile to share with others, or keep private.
                    </p>
                  </div>
                )
              }
              if (isAdmin) {
                return (
                  <div>
                    <label className="label">Dataset Access (Profile)</label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      Leave blank for admin-only. Assign a profile to share with users.
                    </p>
                    <ProfilePicker
                      companyCode={datasetProfileCompanyCode}
                      buCode={datasetProfileBuCode}
                      teamCode={datasetProfileTeamCode}
                      onChange={(c, b, t) => {
                        setDatasetProfileCompanyCode(c)
                        setDatasetProfileBuCode(b)
                        setDatasetProfileTeamCode(t)
                      }}
                    />
                  </div>
                )
              }
              return null
            })()}

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
