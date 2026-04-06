import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Manage Automated Data Ingestion',
    body: 'The Ingestion Pipelines page lets you view and manage all your automated data import schedules and email-based ingestion history.',
    steps: [
      'View all your cloud pipelines (Google Drive, OneDrive)',
      'Check the status and last run time of each pipeline',
      'Enable or disable pipelines with a toggle',
      'Click "Run Now" to manually trigger a pipeline',
      'Monitor email ingestion attempts and results'
    ]
  },
  {
    heading: 'Cloud Pipelines',
    body: 'Cloud pipelines automatically import files from Google Drive or OneDrive on a schedule. Monitor the status column to see if the last run succeeded.',
    steps: [
      'Status shows success, failure, or no new files',
      'Last Run shows when the pipeline last executed',
      'Schedule shows how often the pipeline runs'
    ]
  },
  {
    heading: 'Email Ingestion',
    body: 'Email ingestion lets you send dataset updates via email. View the history of all email ingestion attempts here.'
  }
]

export default function IngestionPipelinesHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'ingestion-pipelines')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
