import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Manage Scheduled Reports',
    body: 'View, edit, and manage all your report schedules in one place.',
    steps: [
      'View all your scheduled reports in the list',
      'Check the status badge for each schedule',
      'Expand rows to see detailed schedule information'
    ]
  },
  {
    heading: 'Schedule Actions',
    body: 'Perform these actions on your scheduled reports:',
    steps: [
      'Click "Edit" to modify schedule frequency and time',
      'Click "Run Now" to trigger an immediate report generation',
      'Toggle the switch to enable or disable a schedule',
      'Click the delete icon to remove a schedule'
    ]
  },
  {
    heading: 'View Completed Runs',
    body: 'Check the history of report executions:',
    steps: [
      'Click "Completed Runs" to expand the section',
      'View timestamp and model used for each run',
      'Click "Load" to reload a previous report in Plan Report',
      'Click the delete icon to remove a specific run'
    ]
  },
  {
    heading: 'Admin Features',
    body: 'Administrators can view and manage all scheduled reports in the system.'
  }
]

export default function ManageReportsHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'manage-reports')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
