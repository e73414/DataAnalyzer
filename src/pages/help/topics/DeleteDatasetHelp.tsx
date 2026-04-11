import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Delete a Dataset',
    body: 'Remove datasets that are no longer needed from the system.',
    steps: [
      'Navigate to the Delete Dataset page',
      'Select the dataset you want to remove',
      'Review the dataset details',
      'Click "Delete" to confirm removal'
    ]
  },
  {
    heading: 'Important Notes',
    body: 'Deletion is permanent and affects all related data:',
    steps: [
      'All saved questions for this dataset will be removed',
      'Report schedules using this dataset will be disabled',
      'Historical analysis results will be deleted'
    ]
  },
  {
    heading: 'Backup First',
    body: 'Consider exporting your data before deletion if you might need it later.'
  }
]

export default function DeleteDatasetHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'delete-dataset')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
