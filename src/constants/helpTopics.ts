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
    slug: 'history',
    appPath: '/history',
    title: 'History',
    description: 'View your conversation and analysis history',
    icon: '📝'
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
