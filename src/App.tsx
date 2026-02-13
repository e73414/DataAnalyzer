import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useSession } from './context/SessionContext'
import LoginPage from './pages/LoginPage'
import DatasetPromptPage from './pages/DatasetPromptPage'
import ResultsPage from './pages/ResultsPage'
import EditSummaryPage from './pages/EditSummaryPage'
import UpdateDatasetPage from './pages/UpdateDatasetPage'
import UploadDatasetPage from './pages/UploadDatasetPage'
import DeleteDatasetPage from './pages/DeleteDatasetPage'
import HistoryPage from './pages/HistoryPage'
import ReportTemplateManagerPage from './pages/ReportTemplateManagerPage'
import UploadReportTemplatePage from './pages/UploadReportTemplatePage'

function UnauthorizedPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v.01M12 9v3m9.75 3a9.75 9.75 0 11-19.5 0 9.75 9.75 0 0119.5 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          You are not authorized to access this application. Please sign in with a registered email address.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="btn-primary px-6"
        >
          Go to Sign In
        </button>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isValidating } = useSession()
  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
      </div>
    )
  }
  if (!isLoggedIn) {
    return <Navigate to="/unauthorized" replace />
  }
  return <>{children}</>
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/analyze"
        element={
          <ProtectedRoute>
            <DatasetPromptPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/results"
        element={
          <ProtectedRoute>
            <ResultsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/edit-summary"
        element={
          <ProtectedRoute>
            <EditSummaryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/update-dataset"
        element={
          <ProtectedRoute>
            <UpdateDatasetPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/upload-dataset"
        element={
          <ProtectedRoute>
            <UploadDatasetPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/delete-dataset"
        element={
          <ProtectedRoute>
            <DeleteDatasetPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/history"
        element={
          <ProtectedRoute>
            <HistoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/report-templates"
        element={
          <ProtectedRoute>
            <ReportTemplateManagerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/upload-report-template"
        element={
          <ProtectedRoute>
            <UploadReportTemplatePage />
          </ProtectedRoute>
        }
      />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/unauthorized" replace />} />
    </Routes>
  )
}

export default App
