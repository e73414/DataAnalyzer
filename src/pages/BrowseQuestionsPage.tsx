import { useState, useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'
import { useSession } from '../context/SessionContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import Navigation from '../components/Navigation'
import PageTitle from '../components/PageTitle'
import type { BrowsableQuestion } from '../types'

// ── Org helpers ───────────────────────────────────────────────────────────────

function parseProfile(profile: string | null | undefined) {
  const p = profile?.trim()
  if (!p || p.length < 9) return null
  return { company: p.slice(0, 3), bu: p.slice(3, 6), team: p.slice(6, 9) }
}

function orgLabel(code: string, level: 'Company' | 'Unit' | 'Team') {
  if (code === '000') return `All ${level === 'Company' ? 'Companies' : level === 'Unit' ? 'Units' : 'Teams'}`
  return `${level}: ${code.toUpperCase()}`
}

// ── Search scoring ────────────────────────────────────────────────────────────

function score(q: BrowsableQuestion, term: string): number {
  const t = term.toLowerCase()
  let s = 0
  if (q.prompt.toLowerCase().includes(t)) s += 3
  if ((q.dataset_name ?? '').toLowerCase().includes(t)) s += 2
  if (q.owner_email.toLowerCase().includes(t)) s += 1
  return s
}

// ── Question card ─────────────────────────────────────────────────────────────

function QuestionCard({ q }: { q: BrowsableQuestion }) {

  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 dark:text-white line-clamp-2 mb-1.5">{q.prompt}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
            {q.dataset_name}
          </span>
          <span className={`px-1.5 py-0.5 rounded ${q.editable ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'}`}>
            {q.editable ? 'Editable' : 'Auto-run'}
          </span>
          <span className="text-gray-400 dark:text-gray-500">{q.owner_email}</span>
        </div>
      </div>
      <button
        onClick={() => window.open(`/question/${q.id}`, '_blank')}
        className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-purple-900 hover:bg-purple-800 rounded-lg transition-colors"
      >
        Open
      </button>
    </div>
  )
}

// ── Collapsible group ─────────────────────────────────────────────────────────

function CollapsibleGroup({
  label, count, defaultOpen = false, children,
}: { label: string; count: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between py-2 text-left group"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">
            {label}
          </span>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">{count}</span>
      </button>
      {open && <div className="pl-6 space-y-2 pb-2">{children}</div>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BrowseQuestionsPage() {
  const { session } = useSession()
  const [search, setSearch] = useState('')

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['browse-questions', session?.email],
    queryFn: () => pocketbaseService.browseSavedQuestions(session!.email),
    enabled: !!session?.email,
  })

  const term = search.trim()

  // ── Filtered questions ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!term) return questions
    return questions.filter(q => score(q, term) > 0)
  }, [questions, term])

  const bestMatches = useMemo(() => {
    if (!term) return []
    return [...filtered].sort((a, b) => score(b, term) - score(a, term))
  }, [filtered, term])

  // ── Questions by Org ────────────────────────────────────────────────────────
  type OrgTree = Record<string, Record<string, Record<string, BrowsableQuestion[]>>>
  const orgTree = useMemo<OrgTree>(() => {
    const tree: OrgTree = {}
    for (const q of filtered) {
      const parsed = parseProfile(q.owner_profile)
      const company = parsed?.company ?? '???'
      const bu      = parsed?.bu      ?? '???'
      const team    = parsed?.team    ?? '???'
      ;(tree[company] ??= {})[bu] ??= {}
      ;((tree[company][bu])[team] ??= []).push(q)
    }
    return tree
  }, [filtered])

  // ── Questions by User ───────────────────────────────────────────────────────
  const byUser = useMemo<Record<string, BrowsableQuestion[]>>(() => {
    const map: Record<string, BrowsableQuestion[]> = {}
    for (const q of filtered) {
      ;(map[q.owner_email] ??= []).push(q)
    }
    return map
  }, [filtered])

  const totalCount = questions.length

  return (
    <div className="min-h-screen bg-gray-200 dark:bg-gray-950">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <PageTitle fallback="Browse Questions" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Explore saved questions and analysis prompts.</p>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search questions, datasets, or users…"
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-400"
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

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : totalCount === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm">No questions available yet.</p>
          </div>
        ) : (
          <div className="space-y-8">

            {/* ── Best Matches ─────────────────────────────────────────────── */}
            {term && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                  Best Matches ({bestMatches.length})
                </h2>
                {bestMatches.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No results for "{term}"</p>
                ) : (
                  <div className="space-y-2">
                    {bestMatches.map(q => <QuestionCard key={q.id} q={q} />)}
                  </div>
                )}
              </section>
            )}

            {/* ── Questions by Org ─────────────────────────────────────────── */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                Questions by Org
              </h2>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 px-4 py-1">
                {Object.keys(orgTree).length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No results</p>
                ) : Object.entries(orgTree).sort(([a], [b]) => a.localeCompare(b)).map(([company, bus]) => {
                  const companyCount = Object.values(bus).flatMap(t => Object.values(t)).flat().length
                  return (
                    <CollapsibleGroup key={company} label={orgLabel(company, 'Company')} count={companyCount} defaultOpen={Object.keys(orgTree).length === 1}>
                      {Object.entries(bus).sort(([a], [b]) => a.localeCompare(b)).map(([bu, teams]) => {
                        const buCount = Object.values(teams).flat().length
                        return (
                          <CollapsibleGroup key={bu} label={orgLabel(bu, 'Unit')} count={buCount} defaultOpen={buCount <= 5}>
                            {Object.entries(teams).sort(([a], [b]) => a.localeCompare(b)).map(([team, qs]) => (
                              <CollapsibleGroup key={team} label={orgLabel(team, 'Team')} count={qs.length} defaultOpen={qs.length <= 5}>
                                <div className="space-y-2 pt-1">
                                  {qs.map(q => <QuestionCard key={q.id} q={q} />)}
                                </div>
                              </CollapsibleGroup>
                            ))}
                          </CollapsibleGroup>
                        )
                      })}
                    </CollapsibleGroup>
                  )
                })}
              </div>
            </section>

            {/* ── Questions by Saved User ───────────────────────────────────── */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                Questions by Saved User
              </h2>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 px-4 py-1">
                {Object.keys(byUser).length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No results</p>
                ) : Object.entries(byUser).sort(([a], [b]) => a.localeCompare(b)).map(([email, qs]) => (
                  <CollapsibleGroup key={email} label={email} count={qs.length} defaultOpen={qs.length <= 3}>
                    <div className="space-y-2 pt-1">
                      {qs.map(q => <QuestionCard key={q.id} q={q} />)}
                    </div>
                  </CollapsibleGroup>
                ))}
              </div>
            </section>

          </div>
        )}
      </div>
    </div>
  )
}
