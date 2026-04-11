import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Edit AI-Generated Summaries',
    body: 'Refine the AI-generated summary of your dataset to better reflect your business context and terminology.',
    steps: [
      'Review the automatically generated summary',
      'Add or remove key information as needed',
      'Update terminology to match your business language',
      'Save changes to update the dataset description'
    ]
  },
  {
    heading: 'Why Edit Summaries',
    body: 'Custom summaries help AI generate more relevant analyses by understanding your specific context.',
    steps: [
      'Include industry-specific terms and acronyms',
      'Highlight business priorities and KPIs',
      'Add context about data collection methods'
    ]
  }
]

export default function EditSummaryHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'edit-summary')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
