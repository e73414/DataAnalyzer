import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Application Settings',
    body: 'Admin > Settings lets you configure global defaults that apply to all users. When a setting is set here, the corresponding option is hidden from individual users — they use the admin-defined value instead.',
  },
  {
    heading: 'AI Model Settings',
    body: 'Lock specific AI models for different operations:',
    steps: [
      'Analyze Model — the model used for Quick Answer and conversation queries',
      'Plan Model — the model used to generate Plan Report execution plans',
      'Execute Model — the model used to run each step in a Plan Report',
      'Report Model — the model used to format and assemble the final report'
    ]
  },
  {
    heading: 'Report Defaults',
    body: 'Set organisation-wide defaults for report generation:',
    steps: [
      'Detail Level — default Show Steps setting (Highly Detailed, Some Detail, Just Overview, None)',
      'Report Detail — default output format (Simple Report or Detailed Report)',
      'Chunk Threshold — default rows-per-chunk for large dataset processing'
    ]
  },
  {
    heading: 'Dataset Settings',
    body: 'Configure the prompt used when "Have AI Describe Data" is triggered on the Edit Dataset Summary page. This prompt is sent to the AI along with the dataset to generate an automatic description.'
  },
  {
    heading: 'Timezone Default',
    body: 'Set the default timezone applied to new user accounts. Individual users can override this from their profile settings.'
  }
]

export default function AdminSettingsHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'admin-settings')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
