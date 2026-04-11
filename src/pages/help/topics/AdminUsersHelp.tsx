import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'User Manager Overview',
    body: 'Create and manage user accounts and their access profiles.',
    steps: [
      'Add new users with their email and temporary password',
      'Assign one or more profile codes to each user',
      'Set timezone preferences for scheduled reports'
    ]
  },
  {
    heading: 'Profile Assignments',
    body: 'Users can have multiple profile assignments for cross-functional access:',
    steps: [
      'A user in "Sales" can also have "Marketing" access',
      'Profile "adm" grants admin access to all features',
      'Multiple profiles enable flexible access control'
    ]
  },
  {
    heading: 'User Actions',
    body: 'Perform these actions on users:',
    steps: [
      'Edit user email, password, timezone, and profiles',
      'Delete users when they leave the organization',
      'Double-click email to edit inline'
    ]
  }
]

export default function AdminUsersHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'admin-users')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
