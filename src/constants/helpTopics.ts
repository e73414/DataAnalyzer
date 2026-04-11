export interface HelpTopic {
  slug: string
  appPath: string
  title: string
  description: string
  icon: string
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    slug: 'analyze',
    appPath: '/analyze',
    title: 'Analyze Data',
    description: 'Query your datasets with AI-powered insights',
    icon: '🔍'
  },
  {
    slug: 'results',
    appPath: '/results',
    title: 'Results',
    description: 'View and export your AI-generated analysis results',
    icon: '📈'
  },
  {
    slug: 'edit-summary',
    appPath: '/edit-summary',
    title: 'Edit Summary',
    description: 'Refine and edit AI-generated data summaries',
    icon: '✏️'
  },
  {
    slug: 'upload-dataset',
    appPath: '/upload-dataset',
    title: 'Upload Dataset',
    description: 'Import CSV or Excel files into the system',
    icon: '📤'
  },
  {
    slug: 'update-dataset',
    appPath: '/update-dataset',
    title: 'Update Dataset',
    description: 'Add new data to existing datasets',
    icon: '🔄'
  },
  {
    slug: 'delete-dataset',
    appPath: '/delete-dataset',
    title: 'Delete Dataset',
    description: 'Remove datasets from the system',
    icon: '🗑️'
  },
  {
    slug: 'csv-optimizer',
    appPath: '/csv-optimizer',
    title: 'CSV Optimizer',
    description: 'Transform and clean your CSV data',
    icon: '⚙️'
  },
  {
    slug: 'csv-optimizer-plus',
    appPath: '/csv-optimizer-plus',
    title: 'CSV Optimizer Plus',
    description: 'Advanced data transformation with automation',
    icon: '✨'
  },
  {
    slug: 'excel-upload',
    appPath: '/upload-excel',
    title: 'Excel Upload',
    description: 'Upload Excel files directly into datasets',
    icon: '📊'
  },
  {
    slug: 'upload-report-template',
    appPath: '/upload-report-template',
    title: 'Upload Report Template',
    description: 'Create reusable report templates',
    icon: '📄'
  },
  {
    slug: 'history',
    appPath: '/history',
    title: 'History',
    description: 'View your conversation and analysis history',
    icon: '📝'
  },
  {
    slug: 'manage-reports',
    appPath: '/manage-reports',
    title: 'Manage Reports',
    description: 'View, edit, and manage scheduled reports',
    icon: '📋'
  },
  {
    slug: 'ingestion-pipelines',
    appPath: '/ingestion-pipelines',
    title: 'Ingestion Pipelines',
    description: 'Manage automated data ingestion schedules',
    icon: '🔗'
  },
  {
    slug: 'ingestion-schedule',
    appPath: '/ingestion/:datasetId',
    title: 'Ingestion Schedule',
    description: 'Configure automatic dataset updates',
    icon: '⏱️'
  },
  {
    slug: 'plan-report',
    appPath: '/plan-report',
    title: 'Plan Report',
    description: 'Generate and customize data reports',
    icon: '📋'
  },
  {
    slug: 'report-templates',
    appPath: '/report-templates',
    title: 'Report Templates',
    description: 'Manage reusable report templates',
    icon: '📑'
  },
  {
    slug: 'browse-questions',
    appPath: '/browse-questions',
    title: 'Browse Questions',
    description: 'Explore saved questions and analyses',
    icon: '❓'
  },
  {
    slug: 'manage-questions',
    appPath: '/manage-questions',
    title: 'Manage Questions',
    description: 'Create and organize saved questions',
    icon: '✏️'
  },
  {
    slug: 'admin-profiles',
    appPath: '/admin/profiles',
    title: 'Admin - Profiles',
    description: 'Manage company, business unit, and team profile codes',
    icon: '🏢'
  },
  {
    slug: 'admin-users',
    appPath: '/admin/users',
    title: 'Admin - Users',
    description: 'Create and manage user accounts and access profiles',
    icon: '👥'
  },
  {
    slug: 'admin-templates',
    appPath: '/admin/templates',
    title: 'Admin - Templates',
    description: 'Manage dataset access templates and permissions',
    icon: '📄'
  },
  {
    slug: 'admin-settings',
    appPath: '/admin/settings',
    title: 'Admin - Settings',
    description: 'Configure global application settings',
    icon: '⚙️'
  }
]

export function findTopicByPath(pathname: string): HelpTopic | undefined {
  // Exact match first
  const exact = HELP_TOPICS.find(t => t.appPath === pathname)
  if (exact) return exact

  // Handle parameterized routes like /ingestion/:datasetId
  for (const topic of HELP_TOPICS) {
    const pattern = topic.appPath.replace(/:[^/]+/g, '[^/]+')
    const regex = new RegExp(`^${pattern}$`)
    if (regex.test(pathname)) return topic
  }

  return undefined
}
