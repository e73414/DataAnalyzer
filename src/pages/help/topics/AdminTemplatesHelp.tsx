import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Dataset Access Manager',
    body: 'Control which users can access specific datasets using profile codes.',
    steps: [
      'View all datasets with their current profile assignments',
      'Click "Edit Profile" to assign or change a dataset\'s access profile',
      'Download datasets as CSV for external use'
    ]
  },
  {
    heading: 'Profile Assignment Options',
    body: 'Set access levels using the hierarchical profile system:',
    steps: [
      'Owner only: Only the dataset owner can access',
      'Company level: All users in the company can access',
      'BU level: All users in the business unit can access',
      'Team level: Only specific teams can access',
      'No profile: All users can access (open dataset)'
    ]
  },
  {
    heading: 'Owner Management',
    body: 'Change dataset ownership to reassign responsibility for the dataset.'
  }
]

export default function AdminTemplatesHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'admin-templates')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
