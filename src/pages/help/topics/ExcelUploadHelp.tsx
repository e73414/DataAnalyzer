import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Quick Excel Upload',
    body: 'Upload Excel files directly into your datasets with automatic column matching and data validation.',
    steps: [
      'Select the dataset to update with new Excel data',
      'Choose an Excel file (.xlsx or .xls)',
      'The system automatically detects and maps columns',
      'Review the preview before confirming',
      'Click "Upload" to add the data'
    ]
  },
  {
    heading: 'Supported Formats',
    body: 'Both modern Excel (.xlsx) and legacy Excel (.xls) formats are supported. The first sheet in the workbook will be used.'
  },
  {
    heading: 'Column Mapping',
    body: 'Columns are matched automatically based on header names. If needed, you can manually adjust the mapping before upload.'
  }
]

export default function ExcelUploadHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'excel-upload')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
