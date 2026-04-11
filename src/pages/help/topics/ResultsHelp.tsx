import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'View Analysis Results',
    body: 'After running an analysis, view your results here. The AI processes your data and generates insights based on your query.',
    steps: [
      'Review the AI-generated response to your data question',
      'Use the tabs to switch between different result views',
      'Click "View Details" for in-depth breakdowns',
      'Use the export buttons to save results'
    ]
  },
  {
    heading: 'Export Options',
    body: 'Save your analysis results in various formats for sharing or reporting.',
    steps: [
      'Export to PDF for presentations and reports',
      'Export to CSV for further analysis in Excel',
      'Copy results to clipboard for quick sharing'
    ]
  },
  {
    heading: 'Follow-up Actions',
    body: 'Build on your analysis with these options:',
    steps: [
      'Save the question for future reference',
      'Schedule regular reports on this topic',
      'Run additional analyses on the same dataset'
    ]
  }
]

export default function ResultsHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'results')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
