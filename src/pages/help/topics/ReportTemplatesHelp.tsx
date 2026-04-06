import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Manage Report Templates',
    body: 'Create and manage reusable report templates to standardize your reporting across teams and projects.',
    steps: [
      'Browse existing templates in the library',
      'Click to preview any template',
      'Upload new templates using HTML or custom markup',
      'Edit template names and descriptions',
      'Use templates in the Plan Report feature'
    ]
  },
  {
    heading: 'Template Requirements',
    body: 'Templates should be valid HTML or use template syntax that supports variable substitution for dataset values.'
  },
  {
    heading: 'Sharing Templates',
    body: 'Templates you create are available to all users in your organization. Consider your audience when naming and describing templates.'
  }
]

export default function ReportTemplatesHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'report-templates')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
