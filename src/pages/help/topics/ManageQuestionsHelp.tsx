import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Manage Saved Questions',
    body: 'Manage Questions is an admin view showing all saved questions across all users. Use it to review, copy shareable links, or delete questions that are no longer relevant.',
    steps: [
      'Filter the list by owner email using the search field',
      'Click the copy icon to copy the direct link to a question',
      'Click the delete icon to permanently remove a question'
    ]
  },
  {
    heading: 'Saving Questions from Analysis',
    body: 'Questions are saved from the Analysis History page. Click the bookmark icon on any Conversation history entry to open the Save Question modal:',
    steps: [
      'Enter a title for the question',
      'Choose whether the question is Editable (users can modify the prompt) or Auto-run (executes immediately)',
      'Confirm to save — the question then appears in Browse Questions'
    ]
  },
  {
    heading: 'Question Access',
    body: 'Saved questions inherit visibility from the dataset they reference. Users who can access the dataset can see and run questions linked to it.'
  }
]

export default function ManageQuestionsHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'manage-questions')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
