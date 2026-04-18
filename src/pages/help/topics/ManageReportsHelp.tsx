import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Manage Scheduled Reports',
    body: 'Manage Reports shows all scheduled report runs — both your own and, for admins, all users\'. Each row shows the report prompt, dataset, schedule, enabled/disabled status, and the most recent run result.',
    steps: [
      'Expand a row to view schedule details and the list of completed runs',
      'Toggle the switch to enable or disable a schedule',
      'Click "Run Now" to trigger an immediate report execution',
      'Click the edit icon to modify the schedule frequency, time, or timezone',
      'Click the delete icon to remove the schedule entirely'
    ]
  },
  {
    heading: 'Completed Runs',
    body: 'Each schedule has an expandable "Completed Runs" section showing past executions:',
    steps: [
      'View the timestamp and AI model used for each run',
      'Click the reload icon to load a past run back into the Plan Report page for review or re-execution',
      'Click the delete icon to remove a specific run from history'
    ]
  },
  {
    heading: 'Email Distribution',
    body: 'Scheduled reports can be emailed automatically to a list of recipients on each run. The recipient list is configured when setting up the schedule from the Plan Report page.'
  },
  {
    heading: 'Admin View',
    body: 'Administrators see all scheduled reports across all users, making it easy to monitor report health and clean up stale schedules.'
  }
]

export default function ManageReportsHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'manage-reports')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
