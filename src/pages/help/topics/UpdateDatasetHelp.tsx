import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Add New Data to Existing Datasets',
    body: 'Update your datasets with new rows of data without creating a new dataset. This is useful for regular data refreshes and additions.',
    steps: [
      'Select the dataset to update',
      'Choose a file with new data in the same format',
      'Review the column matching',
      'Click "Update" to add the data'
    ]
  },
  {
    heading: 'Format Requirements',
    body: 'The new data file must have the same columns as your original dataset. The system will automatically match the columns.'
  },
  {
    heading: 'Data Validation',
    body: 'The system validates that the new data matches your dataset structure before updating. Any errors will be reported so you can fix them.'
  }
]

export default function UpdateDatasetHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'update-dataset')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
