import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Analyze and Clean CSV Files',
    body: 'CSV Optimizer scans a CSV file for data quality issues and suggests automated fixes. Use it to prepare raw data before uploading it as a dataset.',
    steps: [
      'Click "Choose File" to select a CSV file',
      'The tool analyses the file for nulls, errors, formula strings, data type inconsistencies, duplicates, and column correlations',
      'Review the findings and recommended cleanup actions',
      'Apply selected fixes and download or save the cleaned CSV'
    ]
  },
  {
    heading: 'What It Checks',
    body: 'The optimizer identifies these categories of issues:',
    steps: [
      'Null / missing values — empty cells that may need filling or row removal',
      'Error values — cells containing #VALUE!, #REF!, or similar formula errors',
      'Data type issues — columns where mixed types (text mixed with numbers) may cause analysis problems',
      'Duplicate rows — identical or near-identical records',
      'Column correlations — columns that appear redundant or derived from each other'
    ]
  },
  {
    heading: 'Preview Before Applying',
    body: 'All recommended changes are shown as a preview before being applied. Review the before/after comparison for each suggested fix, then choose which changes to accept.'
  },
  {
    heading: 'Output Options',
    body: 'After applying fixes, download the optimised CSV to your device, or use the Upload button to create a new dataset directly from the cleaned file.'
  }
]

export default function CsvOptimizerHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'csv-optimizer')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
