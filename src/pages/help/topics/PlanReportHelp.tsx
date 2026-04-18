import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Overview',
    body: 'Plan & Execute Report generates structured, multi-section reports from one or more datasets. The AI first creates a step-by-step execution plan, then runs each step and assembles the final report.',
    steps: [
      'Enter your report requirements in plain language',
      'Optionally select one or more datasets (the AI can also select them automatically)',
      'Click "Plan Report" to generate the execution plan',
      'Review the plan, then click "Execute Plan" to run it'
    ]
  },
  {
    heading: 'Report Requirements',
    body: 'Describe what the report should cover — key metrics, comparisons, time periods, or any specific analysis needed. The more context you provide, the more targeted the plan will be.'
  },
  {
    heading: 'Dataset Selection',
    body: 'Check datasets from the list to include them in the report. Use the search box to filter by name. You can also select none and let the AI identify relevant datasets from your prompt. Each dataset row shows a "Preview" hover and a "CSV" download link.'
  },
  {
    heading: 'Execution Settings',
    body: 'These options appear after a plan is created (some may be hidden if your admin has set defaults):',
    steps: [
      'Plan AI Model — the model used to create the execution plan',
      'Execute AI Model — the model used to run each step',
      'Rows Per Chunk — for large datasets, controls how many rows are processed per AI call (lower = simpler but slower)',
      'Detail Level — "Simple Report" for a concise overview, "Detailed Report" for in-depth analysis',
      'Show Steps — how much of the step-by-step reasoning to include: Highly Detailed, Some Detail, Just Overview, or None'
    ]
  },
  {
    heading: 'Execution Plan',
    body: 'After clicking "Plan Report", the AI generates a numbered list of steps. Each step shows the dataset, columns used, and the query logic. Review the plan before executing — you can re-plan with a refined prompt if needed.'
  },
  {
    heading: 'Execute Plan',
    body: 'Click "Execute Plan" to run all steps. A progress indicator shows each step completing. Check "Present Formatted Report" to have the AI format the final output as a polished HTML report. Click "Stop Execution" to cancel mid-run.'
  },
  {
    heading: 'Report Output',
    body: 'The completed report renders inline. You can click inside the report to edit text directly. Use "Download" to save the report, or "Email Report" to send it to one or more recipients.'
  },
  {
    heading: 'Scheduling Reports',
    body: 'After a report is saved, a "Schedule" section appears. Set a schedule type (daily, weekly, monthly, or custom cron), time, and timezone. Enable "Re-plan on Run" to have the AI rebuild the execution plan each time the report runs. Toggle a schedule on/off, or delete it from the schedule list.'
  },
  {
    heading: 'Loading from History',
    body: 'Reports saved to history can be reloaded into this page. Click the reload icon on an "Execute Plan" entry in Analysis History to restore the prompt, plan, and report output for review or re-execution.'
  }
]

export default function PlanReportHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'plan-report')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
