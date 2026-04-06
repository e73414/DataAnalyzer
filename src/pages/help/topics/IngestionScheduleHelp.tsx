import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Set Up Automatic Data Updates',
    body: 'Configure automatic ingestion schedules to regularly update your datasets from cloud storage or email.',
    steps: [
      'Select your cloud storage location (Google Drive or OneDrive)',
      'Choose the folder containing your data files',
      'Set the update schedule (hourly, daily, weekly, etc.)',
      'Enable the pipeline to start automatic updates',
      'Monitor the results in the Ingestion Pipelines page'
    ]
  },
  {
    heading: 'Schedule Options',
    body: 'Use cron expressions for custom schedules, or select from preset options like daily at midnight or weekly on Monday.'
  },
  {
    heading: 'File Detection',
    body: 'The system automatically detects new or updated files in your folder. Only files with matching columns are ingested.'
  }
]

export default function IngestionScheduleHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'ingestion-schedule')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
