// src/pages/mobile/MobileBrowseQuestionsPage.tsx
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '../../context/SessionContext'
import { pocketbaseService } from '../../services/mcpPocketbaseService'
import Navigation from '../../components/Navigation'
import type { BrowsableQuestion } from '../../types'

function parseProfile(profile: string | null | undefined) {
  const p = profile?.trim()
  if (!p || p.length < 9) return null
  return { company: p.slice(0, 3), bu: p.slice(3, 6), team: p.slice(6, 9) }
}

function score(q: BrowsableQuestion, term: string): number {
  const t = term.toLowerCase()
  let s = 0
  if (q.prompt.toLowerCase().includes(t)) s += 3
  if (q.dataset_name.toLowerCase().includes(t)) s += 2
  if (q.owner_email.toLowerCase().includes(t)) s += 1
  return s
}

function QuestionCard({ q }: { q: BrowsableQuestion }) {
  const navigate = useNavigate()
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 dark:text-white line-clamp-2 mb-1.5">{q.prompt}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
            {q.dataset_name}
          </span>
          <span className={`px-1.5 py-0.5 rounded ${
            q.editable
              ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
              : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
          }`}>
            {q.editable ? 'Editable' : 'Auto-run'}
          </span>
          <span className="text-gray-400 dark:text-gray-500 truncate">{q.owner_email}</span>
        </div>
      </div>
      <button
        onClick={() => navigate(`/question/${q.id}`)}
        className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-purple-900 hover:bg-purple-800 rounded-lg transition-colors"
      >
        Open
      </button>
    </div>
  )
}

type OrgFilter = 'all' | 'company' | 'unit' | 'team'

const ORG_CHIPS: { id: OrgFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'company', label: 'My Company' },
  { id: 'unit', label: 'My Unit' },
  { id: 'team', label: 'My Team' },
]

export default function MobileBrowseQuestionsPage() {
  const { session } = useSession()
  const [search, setSearch] = useState('')
  const [orgFilter, setOrgFilter] = useState<OrgFilter>('all')

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['browse-questions', session?.email],
    queryFn: () => pocketbaseService.browseSavedQuestions(session!.email),
    enabled: !!session?.email,
  })

  const userProfile = useMemo(() => parseProfile(session?.profile), [session?.profile])
  const term = search.trim()

  const filtered = useMemo(() => {
    let list = questions

    // Org filter
    if (orgFilter !== 'all' && userProfile) {
      list = list.filter(q => {
        const qp = parseProfile(q.owner_profile)
        if (!qp) return false
        if (orgFilter === 'company') return qp.company === userProfile.company
        if (orgFilter === 'unit') return qp.company === userProfile.company && qp.bu === userProfile.bu
        if (orgFilter === 'team') return (
          qp.company === userProfile.company &&
          qp.bu === userProfile.bu &&
          qp.team === userProfile.team
        )
        return true
      })
    }

    // Search filter — use Schwartzian transform to avoid double score() calls
    if (!term) return list
    return list
      .map(q => ({ q, s: score(q, term) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .map(({ q }) => q)
  }, [questions, term, orgFilter, userProfile])

  return (
    <div className="min-h-screen bg-gray-200 dark:bg-gray-950">
      <Navigation />

      <main className="px-4 py-4 space-y-3">

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search questions, datasets, or users..."
            className="w-full pl-9 pr-4 py-3 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-400"
          />
          {term && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Org filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {ORG_CHIPS.map(chip => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setOrgFilter(chip.id)}
              className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                orgFilter === chip.id
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Questions list */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {term || orgFilter !== 'all' ? 'No matching questions.' : 'No questions available.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {filtered.length} question{filtered.length !== 1 ? 's' : ''}
            </p>
            {filtered.map(q => <QuestionCard key={q.id} q={q} />)}
          </div>
        )}
      </main>
    </div>
  )
}
