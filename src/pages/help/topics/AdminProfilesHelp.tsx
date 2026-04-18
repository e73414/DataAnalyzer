import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Profile Manager Overview',
    body: 'Profile codes control which datasets each user can access. A full profile code is 9 characters: company code (3) + business unit code (3) + team code (3). The Profile Manager has three tabs — Companies, Business Units, and Teams — one for each level of the hierarchy.',
    steps: [
      'Companies (3-char code) — your top-level organisational divisions',
      'Business Units (3-char code) — departments or functional areas within a company',
      'Teams (3-char code) — specific groups within a business unit'
    ]
  },
  {
    heading: 'Profile Code Rules',
    body: 'Codes follow these conventions:',
    steps: [
      '"adm" — reserved for admin-level access; users with profile admadmadm have full admin rights',
      '"000" — wildcard; a dataset with "000" in the BU position is accessible to all BUs within that company',
      'Example: "abc000000" = company "abc", accessible to all BUs and all teams',
      'Example: "abcmkt001" = company "abc", marketing BU, team 001 only'
    ]
  },
  {
    heading: 'Adding and Removing Codes',
    body: 'Use the form on each tab to add a new code and label. Click the delete icon next to a code to remove it. Removing a code does not automatically update datasets or users that reference it.'
  },
  {
    heading: 'Profile Assignment',
    body: 'Assign profile codes to datasets on the Edit Dataset Summary page (Dataset Access section) or through Admin > Templates. Assign profile codes to users on the Admin > Users page.'
  }
]

export default function AdminProfilesHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'admin-profiles')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
