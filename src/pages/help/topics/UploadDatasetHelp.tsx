import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Upload a New Dataset',
    body: 'Upload a CSV file to create a new dataset available for AI analysis. Only CSV files are accepted on this page; use Excel Upload for .xlsx/.xls files.',
    steps: [
      'Click "Choose File" and select a CSV file',
      'Enter a descriptive Dataset Name',
      'Enter a short Description (used for AI dataset selection and search)',
      'Optionally add AI Context — instructions that help the AI understand the data',
      'Click "Upload Dataset" to create the dataset'
    ]
  },
  {
    heading: 'AI Context',
    body: 'The AI Context field (also labelled "Instruct AI How to Build Query" or similar) provides the AI with extra guidance about how the data is structured, what the columns mean, or how to filter and aggregate rows. This becomes part of the AI Summary and can be edited later on the Edit Dataset Summary page.'
  },
  {
    heading: 'After Upload',
    body: 'After uploading, the app navigates to the Edit Dataset Summary page with auto-enrich enabled. The AI will automatically generate a description and sample questions for the dataset. You can review and adjust these before saving.'
  },
  {
    heading: 'Dataset Access',
    body: 'Newly uploaded datasets are accessible only to you by default. Use the Dataset Access section on the Edit Dataset Summary page to share the dataset with other organizational profiles.'
  },
  {
    heading: 'Data Requirements',
    body: 'The CSV file must have a header row as the first row. Column names are normalised for database storage but the originals are preserved in the column mapping. Dates, numbers, and text are all supported.'
  }
]

export default function UploadDatasetHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'upload-dataset')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
