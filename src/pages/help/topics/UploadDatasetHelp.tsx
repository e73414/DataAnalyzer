import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Upload Your First Dataset',
    body: 'Create new datasets by uploading CSV or Excel files. This is the starting point for all data analysis and management.',
    steps: [
      'Click "Choose File" to select a CSV or Excel file',
      'Enter a descriptive name for your dataset',
      'Provide a summary describing the data',
      'Add business context to help AI generate better analyses',
      'Review the detected columns and data types',
      'Click "Upload" to create the dataset'
    ]
  },
  {
    heading: 'Data Requirements',
    body: 'Your file should have a header row with column names. Supported formats include CSV (.csv), Excel (.xlsx, .xls), and Google Sheets.'
  },
  {
    heading: 'Access Control',
    body: 'Control who can access your dataset. By default, only you can access datasets you create.'
  }
]

export default function UploadDatasetHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'upload-dataset')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
