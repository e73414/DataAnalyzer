import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Browsing Your History',
    body: 'The Analysis History page shows all your past conversations, plan report executions, and scheduled reports. Each entry displays a type badge (Conversation, Execute Plan, Plan Report), the prompt, dataset, AI model, and response time.',
    steps: [
      'Toggle "By Date" or "By Dataset" to group entries differently',
      'Use "Both / Conversation / Report" to filter by entry type',
      'Type in the search bar to filter by prompt, response, dataset, or model',
      'Click a group header to expand or collapse it',
      'Click an entry card to expand and read the full response'
    ]
  },
  {
    heading: 'Entry Actions',
    body: 'Each conversation card has three action buttons on the right:',
    steps: [
      'Bookmark icon — Save the entry as a reusable question (not available for Execute Plan entries)',
      'Reload icon — Load an Execute Plan entry back into the Plan Report page (Execute Plan entries only)',
      'Trash icon — Delete the entry from history'
    ]
  },
  {
    heading: 'Selecting and Bulk Deleting',
    body: 'Check the checkbox on any card or group header to select entries. When items are selected, a "Delete Selected" button appears at the top of the page. Click "Clear" to deselect all.'
  },
  {
    heading: 'Sending a Report by Email',
    body: 'Select one or more entries to reveal the "Send Report" panel at the bottom of the page:',
    steps: [
      'Enter one or more recipient email addresses (comma, semicolon, or space separated)',
      'Optionally enter a custom Subject line',
      'Check "Edit Before Sending" to review and edit the AI-formatted report before it is sent',
      'Click "Send Report" (or "Generate Report" if editing) to send'
    ]
  },
  {
    heading: 'Review & Edit Report',
    body: 'When "Edit Before Sending" is checked, clicking "Generate Report" opens a modal with an editable preview of the email content. You can click inside the preview to edit text directly, or click "View / Edit HTML" to switch to a raw HTML editor. Adjust the Subject and Recipients fields, then click "Send Email" to send.'
  }
]

export default function HistoryHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'history')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
