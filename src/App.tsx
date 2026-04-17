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
import PlanReportPage from './pages/PlanReportPage'
import CsvOptimizerPage from './pages/CsvOptimizerPage'
import AiReviewPage from './pages/AiReviewPage'
import CsvOptimizerPlusPage from './pages/CsvOptimizerPlusPage'
import ExcelUploadPage from './pages/ExcelUploadPage'
import ProfileManagerPage from './pages/admin/ProfileManagerPage'
import UserManagerPage from './pages/admin/UserManagerPage'
import TemplateManagerPage from './pages/admin/TemplateManagerPage'
import AppSettingsPage from './pages/admin/AppSettingsPage'
import QuestionPage from './pages/QuestionPage'
import ManageQuestionsPage from './pages/ManageQuestionsPage'
import BrowseQuestionsPage from './pages/BrowseQuestionsPage'
import ManageReportsPage from './pages/ManageReportsPage'
import IngestionSchedulePage from './pages/IngestionSchedulePage'
import IngestionPipelinePage from './pages/IngestionPipelinePage'
import HelpIndexPage from './pages/help/HelpIndexPage'
import AnalyzeHelp from './pages/help/topics/AnalyzeHelp'
import UploadDatasetHelp from './pages/help/topics/UploadDatasetHelp'
import UpdateDatasetHelp from './pages/help/topics/UpdateDatasetHelp'
import CsvOptimizerHelp from './pages/help/topics/CsvOptimizerHelp'
import CsvOptimizerPlusHelp from './pages/help/topics/CsvOptimizerPlusHelp'
import ExcelUploadHelp from './pages/help/topics/ExcelUploadHelp'
import HistoryHelp from './pages/help/topics/HistoryHelp'
import IngestionPipelinesHelp from './pages/help/topics/IngestionPipelinesHelp'
import IngestionScheduleHelp from './pages/help/topics/IngestionScheduleHelp'
import PlanReportHelp from './pages/help/topics/PlanReportHelp'
import ReportTemplatesHelp from './pages/help/topics/ReportTemplatesHelp'
import BrowseQuestionsHelp from './pages/help/topics/BrowseQuestionsHelp'
import ManageQuestionsHelp from './pages/help/topics/ManageQuestionsHelp'
import ResultsHelp from './pages/help/topics/ResultsHelp'
import EditSummaryHelp from './pages/help/topics/EditSummaryHelp'
import DeleteDatasetHelp from './pages/help/topics/DeleteDatasetHelp'
import UploadReportTemplateHelp from './pages/help/topics/UploadReportTemplateHelp'
import ManageReportsHelp from './pages/help/topics/ManageReportsHelp'
import AdminProfilesHelp from './pages/help/topics/AdminProfilesHelp'
import AdminUsersHelp from './pages/help/topics/AdminUsersHelp'
import AdminTemplatesHelp from './pages/help/topics/AdminTemplatesHelp'
import AdminSettingsHelp from './pages/help/topics/AdminSettingsHelp'
import { lazy } from 'react'
import MobileRoute from './components/MobileRoute'

const MobileLoginPage = lazy(() => import('./pages/mobile/MobileLoginPage'))
const MobileDatasetPromptPage = lazy(() => import('./pages/mobile/MobileDatasetPromptPage'))
const MobilePlanReportPage = lazy(() => import('./pages/mobile/MobilePlanReportPage'))
const MobileHistoryPage = lazy(() => import('./pages/mobile/MobileHistoryPage'))
const MobileBrowseQuestionsPage = lazy(() => import('./pages/mobile/MobileBrowseQuestionsPage'))

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

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-200 dark:bg-gray-950">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isValidating } = useSession()
  if (isValidating) return <LoadingSpinner />
  if (!isLoggedIn) return <Navigate to="/unauthorized" replace />
  return <>{children}</>
}

function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoggedIn, isValidating } = useSession()
  if (isValidating) return <LoadingSpinner />
  if (!isLoggedIn) return <Navigate to="/unauthorized" replace />
  if (session?.profile?.trim() !== 'admadmadm') return <Navigate to="/unauthorized" replace />
  return <>{children}</>
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<MobileRoute desktop={LoginPage} mobile={MobileLoginPage} />} />
      <Route
        path="/analyze"
        element={
          <ProtectedRoute>
            <MobileRoute desktop={DatasetPromptPage} mobile={MobileDatasetPromptPage} />
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
            <MobileRoute desktop={HistoryPage} mobile={MobileHistoryPage} />
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
      <Route
        path="/plan-report"
        element={
          <ProtectedRoute>
            <MobileRoute desktop={PlanReportPage} mobile={MobilePlanReportPage} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ai-review"
        element={
          <ProtectedRoute>
            <AiReviewPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/csv-optimizer"
        element={
          <ProtectedRoute>
            <CsvOptimizerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/csv-optimizer-plus"
        element={
          <ProtectedRoute>
            <CsvOptimizerPlusPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/upload-excel"
        element={
          <ProtectedRoute>
            <ExcelUploadPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/profiles"
        element={
          <AdminProtectedRoute>
            <ProfileManagerPage />
          </AdminProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <AdminProtectedRoute>
            <UserManagerPage />
          </AdminProtectedRoute>
        }
      />
      <Route
        path="/admin/templates"
        element={
          <AdminProtectedRoute>
            <TemplateManagerPage />
          </AdminProtectedRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <AdminProtectedRoute>
            <AppSettingsPage />
          </AdminProtectedRoute>
        }
      />
      <Route path="/question/:id" element={<QuestionPage />} />
      <Route
        path="/browse-questions"
        element={
          <ProtectedRoute>
            <MobileRoute desktop={BrowseQuestionsPage} mobile={MobileBrowseQuestionsPage} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manage-questions"
        element={
          <ProtectedRoute>
            <ManageQuestionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manage-reports"
        element={
          <ProtectedRoute>
            <ManageReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ingestion/:datasetId"
        element={
          <ProtectedRoute>
            <IngestionSchedulePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ingestion-pipelines"
        element={
          <ProtectedRoute>
            <IngestionPipelinePage />
          </ProtectedRoute>
        }
      />
      <Route path="/help" element={<HelpIndexPage />} />
      <Route path="/help/analyze" element={<AnalyzeHelp />} />
      <Route path="/help/results" element={<ResultsHelp />} />
      <Route path="/help/edit-summary" element={<EditSummaryHelp />} />
      <Route path="/help/upload-dataset" element={<UploadDatasetHelp />} />
      <Route path="/help/update-dataset" element={<UpdateDatasetHelp />} />
      <Route path="/help/delete-dataset" element={<DeleteDatasetHelp />} />
      <Route path="/help/csv-optimizer" element={<CsvOptimizerHelp />} />
      <Route path="/help/csv-optimizer-plus" element={<CsvOptimizerPlusHelp />} />
      <Route path="/help/excel-upload" element={<ExcelUploadHelp />} />
      <Route path="/help/upload-report-template" element={<UploadReportTemplateHelp />} />
      <Route path="/help/history" element={<HistoryHelp />} />
      <Route path="/help/manage-reports" element={<ManageReportsHelp />} />
      <Route path="/help/ingestion-pipelines" element={<IngestionPipelinesHelp />} />
      <Route path="/help/ingestion-schedule" element={<IngestionScheduleHelp />} />
      <Route path="/help/plan-report" element={<PlanReportHelp />} />
      <Route path="/help/report-templates" element={<ReportTemplatesHelp />} />
      <Route path="/help/browse-questions" element={<BrowseQuestionsHelp />} />
      <Route path="/help/manage-questions" element={<ManageQuestionsHelp />} />
      <Route path="/help/admin-profiles" element={<AdminProfilesHelp />} />
      <Route path="/help/admin-users" element={<AdminUsersHelp />} />
      <Route path="/help/admin-templates" element={<AdminTemplatesHelp />} />
      <Route path="/help/admin-settings" element={<AdminSettingsHelp />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/unauthorized" replace />} />
    </Routes>
  )
}

export default App
