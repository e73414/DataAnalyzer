import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Overview',
    body: 'The Edit Dataset Summary page lets you update the metadata that the AI uses when analysing a dataset. Better descriptions and summaries lead to more accurate and relevant analysis results.',
    steps: [
      'Search for and select a dataset from the dropdown',
      'Update the Dataset Title, Description, and AI Summary as needed',
      'Click "Save Changes" to apply updates'
    ]
  },
  {
    heading: 'Dataset Title and Description',
    body: '"Dataset Title" is the display name shown throughout the app. "Description" is a short plain-English label used for AI dataset selection and search. Keep the description concise and specific.'
  },
  {
    heading: 'AI Summary',
    body: 'The AI Summary is the detailed context the AI reads before generating SQL queries. It supports markdown formatting. Use the Edit / Preview tabs to switch between editing and reading the formatted result. The toolbar provides shortcuts for bold, italic, headings, and lists.',
    steps: [
      'Include column meanings, business terminology, and any known data quirks',
      'Describe relationships between columns and common filtering patterns',
      'Note any columns that contain codes, flags, or non-obvious values'
    ]
  },
  {
    heading: 'Have AI Describe Data',
    body: 'Click "Have AI Describe Data" (visible when configured by your admin) to have the AI generate a description by analysing the dataset. Review the result in the modal and click "Use This Description" to apply it to the Description field.'
  },
  {
    heading: 'Sample Questions',
    body: 'Sample questions appear as clickable chips on the Quick Answer and Results pages, helping users get started. Click "Have AI build sample questions" to auto-generate questions based on the dataset content. You can also add questions manually in the text field and click "Add", or delete existing ones with the X button.'
  },
  {
    heading: 'Column Mapping',
    body: 'Click "Column Mapping" to expand a read-only view of how original CSV column names map to the internal database column names. This is useful for debugging AI-generated queries.'
  },
  {
    heading: 'Dataset Access (Profile)',
    body: 'Use the Dataset Access section to control who can see this dataset. Select a Company, Business Unit, and/or Team to restrict access. Leave all fields blank to make the dataset accessible to all users. Click "Save Changes" to apply the access update.',
  },
  {
    heading: 'Download and Delete',
    body: 'Use the "Download CSV" button to export the full dataset as a CSV file. Use "Delete Dataset" (red button) to permanently remove the dataset. Deletion requires typing the dataset name to confirm.'
  }
]

export default function EditSummaryHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'edit-summary')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
