import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'User Manager Overview',
    body: 'Create and manage user accounts and their access profiles. Each user is identified by email address and can be assigned one or more 9-character profile codes that control which datasets they can access.',
    steps: [
      'Click "Add User" to create a new account',
      'Enter the user\'s email address and a temporary password',
      'Assign one or more profile codes',
      'Set the user\'s timezone (used for scheduled report delivery)',
      'Click "Save" to create the account'
    ]
  },
  {
    heading: 'Profile Assignments',
    body: 'Users can have multiple profile codes for cross-functional access. Each profile grants access to all datasets whose profile code matches:',
    steps: [
      'Profile "admadmadm" grants full admin access to all features and all datasets',
      'A user with profiles "abcmkt000" and "abcsls000" can access marketing and sales datasets',
      'Profiles with "000" wildcards grant broader access within that level'
    ]
  },
  {
    heading: 'Editing Users',
    body: 'Click a user row to expand the edit form. You can update the email, password, timezone, and profile assignments. Double-click the email field in the table to edit it inline.'
  },
  {
    heading: 'Deleting Users',
    body: 'Click the delete icon on a user row to remove the account. Deleted users lose access immediately. Their historical conversations and saved questions are retained in the database.'
  }
]

export default function AdminUsersHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'admin-users')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
