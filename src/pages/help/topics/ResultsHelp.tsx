import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Conversation View',
    body: 'The Results page displays a threaded conversation between you and the AI. Your prompts appear as blue bubbles on the right; AI responses appear on the left. Each response includes the response time in seconds.',
  },
  {
    heading: 'Dataset Preview',
    body: 'Click "View Data" next to the dataset name to show a scrollable preview of the dataset. Click "Hide Preview" to collapse it.'
  },
  {
    heading: 'Asking Follow-up Questions',
    body: 'Use the input bar at the bottom to continue the conversation on the same dataset:',
    steps: [
      'Type a follow-up question in the text field',
      'Click "Send" or press Enter to submit',
      'Use "Let AI Ask" to open the "Refine Your Requirements" dialog for guided clarification',
      'Use "Tips and Sample Questions" to browse saved sample questions for the dataset'
    ]
  },
  {
    heading: 'Switching Datasets',
    body: 'Type in the "Switch dataset..." field below the follow-up input to search for and select a different dataset. Subsequent questions will run against the new dataset.'
  },
  {
    heading: 'Capture Process',
    body: 'Check "Capture Process" to record the AI\'s reasoning steps for the next response. When process content is captured, a "View process used" disclosure link appears below the response, and a "save conversation" button appears to store the result to history.'
  },
  {
    heading: 'Email the Response',
    body: 'Check "Email the response" to send the next AI reply to your registered email. An optional Subject field appears when this is enabled.'
  },
  {
    heading: 'Saving a Conversation',
    body: 'Click "save conversation" (appears after the latest response when process was captured) to save the result to your analysis history. All conversation turns are automatically saved to history as you go.'
  },
  {
    heading: 'View Process Used',
    body: 'If "Capture Process" was enabled, click "View process used" beneath a response to expand the AI\'s SQL queries and reasoning steps for that turn.'
  }
]

export default function ResultsHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'results')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
