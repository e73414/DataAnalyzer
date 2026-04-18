import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Configure Automatic Dataset Updates',
    body: 'The Ingestion Schedule page lets you set up a recurring pipeline that automatically pulls files from cloud storage (Google Drive or OneDrive) and appends new data to a dataset.',
    steps: [
      'Select the cloud source type (Google Drive or OneDrive)',
      'Enter the folder or file path to monitor',
      'Set the update schedule using preset options or a custom cron expression',
      'Enable the pipeline to start automatic updates',
      'Monitor results from the Ingestion Pipelines page'
    ]
  },
  {
    heading: 'Schedule Options',
    body: 'Choose from common presets (hourly, daily, weekly) or enter a custom cron expression for fine-grained control. The schedule runs in UTC unless a timezone is specified.'
  },
  {
    heading: 'Transformation Config',
    body: 'If the incoming files need to be transformed before ingestion (e.g. unpivoting, deduplication, column exclusions), configure these settings in CSV Optimizer Plus and save the ingestion config there. The saved config is applied automatically on each run.'
  },
  {
    heading: 'File Detection',
    body: 'The pipeline checks for files that are new or have been modified since the last successful run. Only files whose column headers match the target dataset are ingested. Files with header mismatches are logged as errors and skipped.'
  },
  {
    heading: 'Email Ingestion',
    body: 'You can also configure an email address that dataset owners can send CSV attachments to. When an email is received, the attachment is processed and appended to the dataset automatically. The email ingestion history is visible on the Ingestion Pipelines page.'
  }
]

export default function IngestionScheduleHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'ingestion-schedule')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
