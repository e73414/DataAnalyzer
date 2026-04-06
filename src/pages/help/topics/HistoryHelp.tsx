import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'View Your Analysis History',
    body: 'The History page shows all your past analyses and interactions with datasets, making it easy to find and revisit previous work.',
    steps: [
      'Access the History page from the main menu',
      'Browse your past analyses and queries',
      'Click on any entry to view details or re-run the analysis',
      'Use filters to find specific analyses by dataset or date'
    ]
  },
  {
    heading: 'Searching and Filtering',
    body: 'You can search by dataset name, AI model used, or date range. This helps you quickly locate specific analyses.'
  },
  {
    heading: 'Reusing Analyses',
    body: 'Click the "Load Plan" button on any historical entry to re-use the same analysis parameters with updated data.'
  }
]

export default function HistoryHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'history')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
