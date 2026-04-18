import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Getting Started',
    body: 'The Quick Answer page lets you ask natural language questions about your datasets. Select a dataset, type your question, and click "Quick Answer" to get an AI-powered response.',
    steps: [
      'Search for and select a dataset from the Dataset field',
      'Type your question in the "Your question" text area',
      'Optionally select an AI model (if not locked by your admin)',
      'Click "Quick Answer" to run the analysis'
    ]
  },
  {
    heading: 'Dataset Selection',
    body: 'Type in the Dataset field to search by name or description. When a dataset is selected, a preview of the first 20 rows appears automatically. Use the Scope filter to narrow the list:',
    steps: [
      'All — show every dataset you have access to',
      'My Datasets — only datasets you own',
      'Company Datasets — datasets shared at the company level',
      'Unit Datasets — datasets shared at the business unit level',
      'Team Datasets — datasets shared at your team level'
    ]
  },
  {
    heading: 'Sample Questions',
    body: 'If the selected dataset has saved sample questions, they appear as clickable chips above the text area. Click any chip to pre-fill the question field.'
  },
  {
    heading: 'Let AI Ask',
    body: 'Click "Let AI Ask" to open the "Refine Your Requirements" dialog. The AI generates clarifying questions based on your prompt to help produce a more targeted analysis. Answer as many or as few as you like, then click "Quick Answer" in the dialog to run the refined analysis.'
  },
  {
    heading: 'Let AI Select Data',
    body: 'If no dataset is selected, a "Let AI Select Data" button appears. Click it to have the AI review your question and suggest the most relevant dataset. A confirmation modal shows the suggested dataset name, description, and confidence level. You can then run the analysis immediately or just select the dataset.'
  },
  {
    heading: 'Capture Process',
    body: 'Check "Capture Process" to record the AI\'s internal reasoning steps alongside the response. The process is viewable in the Results page and can be saved to history.'
  },
  {
    heading: 'Email Response',
    body: 'Check "Email response" to send the analysis result to your registered email address. An optional Subject field appears when this is enabled.'
  }
]

export default function AnalyzeHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'analyze')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
