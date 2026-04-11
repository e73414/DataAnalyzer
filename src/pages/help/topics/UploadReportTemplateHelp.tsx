import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Upload a Report Template',
    body: 'Create reusable report templates that ensure consistent formatting across your reports.',
    steps: [
      'Prepare your template file (HTML or markdown format)',
      'Click "Choose File" to select your template',
      'Enter a descriptive template name',
      'Add optional documentation for template usage',
      'Click "Upload" to save the template'
    ]
  },
  {
    heading: 'Template Best Practices',
    body: 'Create effective templates with these guidelines:',
    steps: [
      'Use consistent branding and styling',
      'Include placeholders for dynamic content',
      'Add section headers for easy navigation',
      'Test templates with sample data first'
    ]
  }
]

export default function UploadReportTemplateHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'upload-report-template')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
