import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Explore Saved Questions',
    body: 'Browse questions that have been saved and shared within your organization. Find insights others have already generated.',
    steps: [
      'Search for questions by keyword or dataset',
      'Filter by author or creation date',
      'Click to view a question and its analysis',
      'Click "Run Question" to execute it with current data',
      'Save interesting questions to your own library'
    ]
  },
  {
    heading: 'Public Questions',
    body: 'Public questions are accessible to anyone with the link. They are great for sharing specific analyses with team members.'
  },
  {
    heading: 'Question Details',
    body: 'Each question shows who created it, when it was created, how many times it has been used, and the dataset it applies to.'
  }
]

export default function BrowseQuestionsHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'browse-questions')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
