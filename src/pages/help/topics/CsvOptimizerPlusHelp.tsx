import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Advanced Data Transformation',
    body: 'CSV Optimizer Plus provides advanced automation options for complex data transformation scenarios.',
    steps: [
      'Upload your file (CSV, Excel, or Google Sheet)',
      'Configure advanced options like unpivoting and deduplication',
      'Specify the header row location',
      'Preview the transformation',
      'Save the configuration for future use'
    ]
  },
  {
    heading: 'Advanced Options',
    body: 'Enable "Keep Duplicates" to preserve all rows even if they have identical data. Disable "Unpivot" to keep your data structure as-is.',
    steps: [
      'Keep Duplicates: Preserves all rows in the output',
      'Unpivot: Transforms wide data to tall format',
      'Header Row: Specify which row contains column names'
    ]
  },
  {
    heading: 'Google Sheets Integration',
    body: 'Paste your Google Sheet URL and the optimizer will fetch and transform your sheet directly.'
  }
]

export default function CsvOptimizerPlusHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'csv-optimizer-plus')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
