import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { n8nService } from '../services/mcpN8nService'
import Navigation from '../components/Navigation'

export default function UploadReportTemplatePage() {
  const { session } = useSession()
  const navigate = useNavigate()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [ownerEmail, setOwnerEmail] = useState(session?.email || '')
  const [access, setAccess] = useState('private')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Report name is required')
      if (!ownerEmail.trim()) throw new Error('Owner email is required')
      if (!selectedFile) throw new Error('Please select a file')

      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1]
          resolve(base64)
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(selectedFile)
      })

      return n8nService.uploadTemplate({
        name: name.trim(),
        description: description.trim(),
        owner_email: ownerEmail.trim(),
        access,
        file: fileData,
        fileName: selectedFile.name,
      })
    },
    onSuccess: () => {
      toast.success('Report template uploaded successfully!')
      navigate('/report-templates')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to upload template')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    uploadMutation.mutate()
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      <Navigation />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Upload Report Template
            </h2>
            <button
              onClick={() => navigate('/report-templates')}
              className="btn-secondary text-sm"
            >
              Back to Templates
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="label">Report Name</label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter report template name"
                disabled={uploadMutation.isPending}
                className="input-field"
                required
              />
            </div>

            <div>
              <label htmlFor="description" className="label">Report Description</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this report template"
                disabled={uploadMutation.isPending}
                className="input-field"
                rows={3}
              />
            </div>

            <div>
              <label htmlFor="ownerEmail" className="label">Owner Email</label>
              <input
                type="email"
                id="ownerEmail"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="owner@example.com"
                disabled={uploadMutation.isPending}
                className="input-field"
                required
              />
            </div>

            <div>
              <label htmlFor="access" className="label">Access</label>
              <select
                id="access"
                value={access}
                onChange={(e) => setAccess(e.target.value)}
                disabled={uploadMutation.isPending}
                className="input-field"
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </div>

            <div>
              <label htmlFor="file" className="label">Template File (PDF or Image)</label>
              <input
                type="file"
                id="file"
                ref={fileInputRef}
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                disabled={uploadMutation.isPending}
                className="input-field file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50"
                required
              />
              {selectedFile && (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={uploadMutation.isPending || !name.trim() || !ownerEmail.trim() || !selectedFile}
                className="btn-primary"
              >
                {uploadMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                    Uploading...
                  </span>
                ) : (
                  'Upload Template'
                )}
              </button>
              <button
                type="button"
                onClick={() => navigate('/report-templates')}
                disabled={uploadMutation.isPending}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
