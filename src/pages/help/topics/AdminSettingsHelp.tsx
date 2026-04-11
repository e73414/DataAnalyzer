import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Application Settings',
    body: 'Configure global application settings for your organization.',
    steps: [
      'Set default AI models for planning and execution',
      'Configure report template defaults',
      'Manage data retention policies'
    ]
  },
  {
    heading: 'Settings Categories',
    body: 'Organization: Set company-wide preferences.',
    steps: [
      'Default detail level for new reports',
      'Timezone defaults for new users',
      'AI provider configuration'
    ]
  }
]

export default function AdminSettingsHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'admin-settings')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
