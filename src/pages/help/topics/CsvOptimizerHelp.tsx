import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Transform and Clean Your CSV Data',
    body: 'The CSV Optimizer allows you to transform raw CSV data into a clean, structured format suitable for analysis.',
    steps: [
      'Select or upload a CSV file',
      'Preview the data to see what needs cleaning',
      'Configure transformation rules (optional)',
      'Review the cleaned output',
      'Download or save the optimized CSV'
    ]
  },
  {
    heading: 'Common Transformations',
    body: 'The optimizer can handle column name normalization, data type conversion, removing duplicates, and more.'
  },
  {
    heading: 'Preview and Validate',
    body: 'Always review the cleaned data before using it. The preview shows exactly what your final CSV will look like.'
  }
]

export default function CsvOptimizerHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'csv-optimizer')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
