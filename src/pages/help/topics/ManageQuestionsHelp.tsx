import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Create and Organize Questions',
    body: 'Save your frequently asked questions for quick reuse and sharing with team members.',
    steps: [
      'After running an analysis, click "Save Question"',
      'Give your question a descriptive title',
      'Add notes about what the question analyzes',
      'Choose if the question is private or public',
      'Select if others can edit your question',
      'Confirm to save'
    ]
  },
  {
    heading: 'Question Privacy',
    body: 'Private questions are only accessible to you. Public questions can be shared via link with anyone. Editable questions allow others to modify them.',
    steps: [
      'Private: Only you can view and use',
      'Public with Link: Shareable but read-only',
      'Public & Editable: Others can modify your question'
    ]
  },
  {
    heading: 'Managing Saved Questions',
    body: 'View all your saved questions, edit descriptions, change privacy settings, or delete questions you no longer need.'
  }
]

export default function ManageQuestionsHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'manage-questions')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
