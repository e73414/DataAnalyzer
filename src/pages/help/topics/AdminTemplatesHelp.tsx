import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Dataset Access Manager',
    body: 'Admin > Templates provides a central view of all datasets and their current profile code assignments. Use it to review and update access control across all datasets without visiting each dataset individually.',
    steps: [
      'Browse the full list of datasets with their owner and current profile code',
      'Click "Edit Profile" on any row to change the dataset\'s access profile',
      'Click "Download CSV" to export the dataset to a file',
      'Click "Change Owner" to reassign the dataset to a different user'
    ]
  },
  {
    heading: 'Profile Assignment Options',
    body: 'When editing a dataset\'s profile, you can set access at different levels:',
    steps: [
      'No profile — the dataset is accessible to all users (open)',
      'Company level — all users in the specified company can access',
      'Business Unit level — all users in the specified BU can access',
      'Team level — only users in the specified team can access',
      'Owner only — restrict via a specific profile code matching only the owner\'s profile'
    ]
  },
  {
    heading: 'Bulk Management',
    body: 'Use the search and filter controls to find datasets by name, owner, or profile code. This makes it efficient to audit access for a specific department or to clean up orphaned datasets.'
  }
]

export default function AdminTemplatesHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'admin-templates')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
