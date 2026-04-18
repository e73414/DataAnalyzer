import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Browse Saved Questions',
    body: 'Browse Questions shows questions that have been saved from the analysis history and shared within your organisation. Use it to find analyses others have already run or to re-run a question against current data.',
    steps: [
      'Search by keyword to filter questions by prompt text or dataset',
      'Filter by owner email to find questions created by a specific person',
      'Browse questions grouped by organisational profile',
      'Click a question to view its full detail and response history'
    ]
  },
  {
    heading: 'Question Badges',
    body: 'Each question card shows a badge indicating its type:',
    steps: [
      'Editable — the question prompt can be modified before running',
      'Auto-run — clicking the question immediately executes it against the current dataset'
    ]
  },
  {
    heading: 'Confidence Level',
    body: 'When a question was created via AI dataset suggestion, a confidence level badge (High, Medium, Low) may appear to indicate how well the AI matched the question to its dataset.'
  },
  {
    heading: 'Running a Question',
    body: 'Click a question card to open it. From the detail view you can run the question against the saved dataset, or switch to a different dataset before running.'
  }
]

export default function BrowseQuestionsHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'browse-questions')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
