import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Generate Customized Reports',
    body: 'Create professional data reports with customizable templates, styling, and detail levels.',
    steps: [
      'Select a dataset and template',
      'Set the detail level (summary, detailed, comprehensive)',
      'Optionally set data chunk threshold for large datasets',
      'Review the generated report preview',
      'Execute to generate the final report or save as template'
    ]
  },
  {
    heading: 'Detail Levels',
    body: 'Choose how much information to include: Summary for quick overviews, Detailed for in-depth analysis, or Comprehensive for complete reports.',
    steps: [
      'Summary: Key metrics and highlights only',
      'Detailed: Includes charts, tables, and analysis',
      'Comprehensive: Full dataset analysis with all details'
    ]
  },
  {
    heading: 'Chunk Threshold',
    body: 'For large datasets, the chunk threshold controls how the data is processed. Lower values process more data per chunk.'
  }
]

export default function PlanReportHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'plan-report')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
