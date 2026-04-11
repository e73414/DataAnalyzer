import { HELP_TOPICS } from '../../../constants/helpTopics'
import HelpPageLayout, { HelpSection } from '../HelpPageLayout'

const SECTIONS: HelpSection[] = [
  {
    heading: 'Profile Manager Overview',
    body: 'Manage the hierarchical profile codes that control data access across your organization.',
    steps: [
      'Companies represent your top-level organizational units',
      'Business Units (BUs) are sub-divisions within companies',
      'Teams are the smallest units, nested within BUs'
    ]
  },
  {
    heading: 'Profile Codes',
    body: 'Profile codes are 9-character combinations: company(3) + BU(3) + team(3)',
    steps: [
      'Use "adm" for admin-level access',
      'Use "000" as a wildcard for any BU or team',
      'Example: "abc001xyz" = company abc, BU 001, team xyz'
    ]
  },
  {
    heading: 'Managing Profile Components',
    body: 'Each tab manages one level of the hierarchy:',
    steps: [
      'Companies: Add your organization\'s main divisions',
      'Business Units: Add departments or functional areas',
      'Teams: Add specific groups within BUs'
    ]
  },
  {
    heading: 'Profile Assignment',
    body: 'Assign profiles to datasets to restrict access. Datasets with no profile assigned are visible to all users.'
  }
]

export default function AdminProfilesHelp() {
  const topic = HELP_TOPICS.find(t => t.slug === 'admin-profiles')!
  return <HelpPageLayout topic={topic} sections={SECTIONS} />
}
