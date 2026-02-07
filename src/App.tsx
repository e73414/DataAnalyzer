import { Routes, Route, Navigate } from 'react-router-dom'
import { useSession } from './context/SessionContext'
import LoginPage from './pages/LoginPage'
import DatasetPromptPage from './pages/DatasetPromptPage'
import ResultsPage from './pages/ResultsPage'
import EditSummaryPage from './pages/EditSummaryPage'
import UpdateDatasetPage from './pages/UpdateDatasetPage'
import UploadDatasetPage from './pages/UploadDatasetPage'
import DeleteDatasetPage from './pages/DeleteDatasetPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useSession()
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />
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
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
