import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Central Pipeline Dashboard',
    body: 'Ingestion Pipelines shows all automated data import pipelines in one place. Two tabs are available: Cloud Sources (Google Drive, OneDrive) and Email Requests.',
    steps: [
      'View all cloud pipelines with their status, last run time, and schedule',
      'Toggle a pipeline on or off using the enable/disable switch',
      'Click "Run Now" to trigger an immediate ingestion run',
      'Click a pipeline row to navigate to its Ingestion Schedule configuration page'
    ]
  },
  {
    heading: 'Cloud Pipeline Status',
    body: 'The Status column shows the result of the most recent run:',
    steps: [
      'Success — new files were found and ingested',
      'No New Files — the pipeline ran but found no new or updated files',
      'Failed — an error occurred; check the ingestion log for details',
      'Never Run — the pipeline has been configured but has not yet executed'
    ]
  },
  {
    heading: 'Email Ingestion Tab',
    body: 'The Email tab shows a history of dataset updates submitted by email. Each entry shows the sender, the dataset targeted, whether processing succeeded, and any error messages. Email ingestion is configured per-dataset on the Ingestion Schedule page.'
  }
]

export default function IngestionPipelinesHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'ingestion-pipelines')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
