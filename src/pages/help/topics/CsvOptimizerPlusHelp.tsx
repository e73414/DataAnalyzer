import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Advanced Data Transformation',
    body: 'CSV Optimizer Plus transforms raw files into a clean, analysis-ready format with advanced options for unpivoting, deduplication, and column selection. It also supports automated ingestion scheduling so the same transformation runs every time new data arrives.',
    steps: [
      'Upload a CSV or Excel file, or paste a Google Sheets URL',
      'Configure transformation options (unpivot, deduplication, column exclusions, header row)',
      'Preview the transformed output',
      'Upload directly to an existing dataset or download the result'
    ]
  },
  {
    heading: 'Transformation Options',
    body: 'Adjust these settings to control the output shape:',
    steps: [
      'Unpivot — converts a wide table (many columns) into a tall table (fewer columns, more rows); disable to keep the original layout',
      'Keep Duplicates — when unchecked, identical rows are removed from the output',
      'Exclude Columns — select specific columns to drop from the output',
      'Header Row — specify which row in the source file contains column names (default is row 1)'
    ]
  },
  {
    heading: 'Google Sheets Integration',
    body: 'Paste a Google Sheets URL into the file input field. The optimizer fetches the sheet directly. Make sure the sheet is publicly accessible or the link is set to "Anyone with the link can view".'
  },
  {
    heading: 'Save Configuration for Ingestion',
    body: 'After configuring the transformation, click "Save Ingestion Config" to store the settings against the target dataset. The saved configuration is then used automatically when new files are ingested via the Ingestion Schedule.'
  }
]

export default function CsvOptimizerPlusHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'csv-optimizer-plus')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
