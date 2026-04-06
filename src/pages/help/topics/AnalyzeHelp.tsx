import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Getting Started',
    body: 'The Analyze Data feature allows you to ask natural language questions about your datasets. Simply select a dataset, choose an AI model, and ask your question. The AI will generate insights and visualizations.',
    steps: [
      'Select a dataset from the dropdown',
      'Choose an AI model for analysis',
      'Enter your question or request',
      'Click "Analyze" to generate insights'
    ]
  },
  {
    heading: 'Filtering and Scope',
    body: 'You can limit the analysis to specific rows or time periods by using the dataset scope filter. This helps focus the AI analysis on relevant data subsets.'
  },
  {
    heading: 'Model Selection',
    body: 'Different AI models may provide different insights. Try different models to find the best results for your analysis.'
  }
]

export default function AnalyzeHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'analyze')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
