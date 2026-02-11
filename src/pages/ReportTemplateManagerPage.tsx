import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import { n8nService } from '../services/mcpN8nService'
import Navigation from '../components/Navigation'
import type { ReportTemplate } from '../types'

export default function ReportTemplateManagerPage() {
  const { session } = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [previewTemplate, setPreviewTemplate] = useState<ReportTemplate | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const {
    data: userProfile,
    isLoading: isLoadingProfile,
  } = useQuery({
    queryKey: ['user-profile', session?.email],
    queryFn: () => pocketbaseService.getUserProfile(session!.email),
    enabled: !!session?.email,
  })

  const {
    data: templates,
    isLoading: isLoadingTemplates,
    error: templatesError,
  } = useQuery({
    queryKey: ['templates', session?.email],
    queryFn: () => n8nService.listTemplates(session!.email),
    enabled: !!session?.email,
  })

  const currentTemplate = templates?.find(
    (t) => t.template_id === userProfile?.template_id
  )

  const handleSelectTemplate = async (templateId: string) => {
    if (!userProfile || !session) return

    setUpdatingId(templateId)
    try {
      await pocketbaseService.updateUserTemplateId(userProfile.id, templateId)
      await queryClient.invalidateQueries({ queryKey: ['user-profile', session.email] })
      toast.success('Default template updated')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update template'
      toast.error(message)
    } finally {
      setUpdatingId(null)
    }
  }

  const handleDeleteTemplate = async (template: ReportTemplate) => {
    if (!session) return
    if (!window.confirm(`Delete template "${template.title}"? This cannot be undone.`)) return

    setDeletingId(template.template_id)
    try {
      await n8nService.deleteTemplate(template.template_id, session.email)

      // If the deleted template was the user's current one, clear it
      if (userProfile && userProfile.template_id === template.template_id) {
        await pocketbaseService.updateUserTemplateId(userProfile.id, '')
        await queryClient.invalidateQueries({ queryKey: ['user-profile', session.email] })
      }

      await queryClient.invalidateQueries({ queryKey: ['templates', session.email] })
      toast.success('Template deleted')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete template'
      toast.error(message)
    } finally {
      setDeletingId(null)
    }
  }

  const isLoading = isLoadingProfile || isLoadingTemplates

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      <Navigation />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Report Template Manager
            </h2>
            <button
              onClick={() => navigate('/upload-report-template')}
              className="btn-primary text-sm"
            >
              Upload Template
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading templates...</p>
            </div>
          ) : templatesError ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-red-600 dark:text-red-400">
                Failed to load templates: {templatesError instanceof Error ? templatesError.message : 'Unknown error'}
              </p>
            </div>
          ) : (
            <>
              {/* Current Template Section */}
              <div className="mb-8">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Current Default Template
                </h3>
                {currentTemplate ? (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium text-blue-900 dark:text-blue-200">{currentTemplate.title}</p>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">{currentTemplate.description}</p>
                      </div>
                      <button
                        onClick={() => setPreviewTemplate(currentTemplate)}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap flex-shrink-0"
                      >
                        Preview
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <p className="text-sm text-gray-500 dark:text-gray-400">No template selected. Choose one from the list below.</p>
                  </div>
                )}
              </div>

              {/* Available Templates */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Available Templates
                </h3>
                {!templates || templates.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4">No templates available.</p>
                ) : (
                  <div className="space-y-3">
                    {templates.map((template) => {
                      const isSelected = template.template_id === userProfile?.template_id
                      const isOwned = template.owner_email === session?.email
                      const isUpdating = updatingId === template.template_id
                      const isDeleting = deletingId === template.template_id

                      return (
                        <div
                          key={template.template_id}
                          className={`p-4 border rounded-lg transition-colors duration-200 ${
                            isSelected
                              ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10'
                              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-medium text-gray-900 dark:text-white">{template.title}</p>
                                {template.is_public ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                                    Public
                                  </span>
                                ) : isOwned ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                                    Yours
                                  </span>
                                ) : null}
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">{template.description}</p>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => setPreviewTemplate(template)}
                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                Preview
                              </button>

                              {isSelected ? (
                                <span className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                  <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Selected
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleSelectTemplate(template.template_id)}
                                  disabled={isUpdating || isDeleting}
                                  className="btn-primary text-sm px-3 py-1.5"
                                >
                                  {isUpdating ? (
                                    <span className="flex items-center gap-1">
                                      <span className="inline-block animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></span>
                                      Selecting...
                                    </span>
                                  ) : (
                                    'Select'
                                  )}
                                </button>
                              )}

                              {isOwned && (
                                <button
                                  onClick={() => handleDeleteTemplate(template)}
                                  disabled={isUpdating || isDeleting}
                                  className="btn-danger text-sm px-3 py-1.5"
                                >
                                  {isDeleting ? (
                                    <span className="flex items-center gap-1">
                                      <span className="inline-block animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></span>
                                      Deleting...
                                    </span>
                                  ) : (
                                    'Delete'
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {previewTemplate.title}
                </h3>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{previewTemplate.description}</p>
            </div>

            {/* Content — sandboxed iframe */}
            <div className="flex-1 overflow-hidden p-4">
              <iframe
                srcDoc={previewTemplate.html_content}
                sandbox="allow-same-origin"
                title="Template Preview"
                className="w-full h-full min-h-[400px] border border-gray-200 dark:border-gray-600 rounded bg-white"
              />
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => setPreviewTemplate(null)}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
