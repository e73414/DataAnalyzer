import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Add Rows to an Existing Dataset',
    body: 'Use Update Dataset to append new rows to a dataset without replacing the existing data. This is the standard way to refresh a dataset with new records.',
    steps: [
      'Select the dataset you want to update from the dropdown',
      'Click "Choose File" and select a CSV file containing the new rows',
      'The system checks whether the file headers match the existing dataset',
      'Confirm the update to append the rows'
    ]
  },
  {
    heading: 'Column Compatibility Check',
    body: 'Before appending, the system compares the new file\'s headers with the existing dataset\'s columns:',
    steps: [
      'Added columns — columns in the new file that do not exist in the dataset',
      'Removed columns — columns in the dataset that are missing from the new file',
      'If mismatches are detected, a confirmation dialog lists the differences so you can decide whether to proceed'
    ]
  },
  {
    heading: 'Format Requirements',
    body: 'The new file must be a CSV with a header row. Column names do not need to match exactly if the differences are intentional, but unexpected mismatches should be reviewed before confirming.'
  }
]

export default function UpdateDatasetHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'update-dataset')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
