# Mobile Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver dedicated, feature-complete mobile layouts for Login, Quick Answer, Plan Report, History, and Browse Questions — served to viewports < 768px; tablets and desktops see existing pages unchanged.

**Architecture:** A `useIsMobile` hook reads `window.matchMedia` synchronously (no flash). A `MobileRoute` wrapper swaps desktop vs lazy-loaded mobile component per route. Mobile pages live in `src/pages/mobile/` and share all services, hooks, and context with their desktop counterparts — only the JSX layout differs.

**Tech Stack:** React 18, Vite, TypeScript, Tailwind CSS, react-router-dom, @tanstack/react-query, react-hook-form, zod, react-hot-toast

---

## File Map

| File | Action |
|---|---|
| `src/hooks/useIsMobile.ts` | Create |
| `src/components/MobileRoute.tsx` | Create |
| `src/App.tsx` | Edit — 5 route swaps + 5 lazy imports |
| `src/pages/mobile/MobileLoginPage.tsx` | Create |
| `src/pages/mobile/MobileDatasetPromptPage.tsx` | Create |
| `src/pages/mobile/MobilePlanReportPage.tsx` | Create |
| `src/pages/mobile/MobileHistoryPage.tsx` | Create |
| `src/pages/mobile/MobileBrowseQuestionsPage.tsx` | Create |

---

## Task 1: useIsMobile Hook

**Files:**
- Create: `src/hooks/useIsMobile.ts`

- [ ] **Step 1: Create the hook**

```ts
// src/hooks/useIsMobile.ts
import { useState, useEffect } from 'react'

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia('(max-width: 767px)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isMobile
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd DataAnalyzer && npx tsc --noEmit
```

Expected: no errors related to `useIsMobile.ts`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useIsMobile.ts
git commit -m "feat: add useIsMobile hook for viewport detection"
```

---

## Task 2: MobileRoute Wrapper

**Files:**
- Create: `src/components/MobileRoute.tsx`

- [ ] **Step 1: Create the wrapper**

```tsx
// src/components/MobileRoute.tsx
import { Suspense } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-200 dark:bg-gray-950">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
    </div>
  )
}

interface MobileRouteProps {
  desktop: React.ComponentType
  mobile: React.LazyExoticComponent<React.ComponentType>
}

export default function MobileRoute({ desktop: Desktop, mobile: Mobile }: MobileRouteProps) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <Mobile />
      </Suspense>
    )
  }
  return <Desktop />
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/MobileRoute.tsx
git commit -m "feat: add MobileRoute wrapper component"
```

---

## Task 3: Wire App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add lazy imports at the top of App.tsx (after existing imports)**

Add these lines directly after the last `import` statement (before `function UnauthorizedPage`):

```tsx
import { lazy } from 'react'
import MobileRoute from './components/MobileRoute'

const MobileLoginPage = lazy(() => import('./pages/mobile/MobileLoginPage'))
const MobileDatasetPromptPage = lazy(() => import('./pages/mobile/MobileDatasetPromptPage'))
const MobilePlanReportPage = lazy(() => import('./pages/mobile/MobilePlanReportPage'))
const MobileHistoryPage = lazy(() => import('./pages/mobile/MobileHistoryPage'))
const MobileBrowseQuestionsPage = lazy(() => import('./pages/mobile/MobileBrowseQuestionsPage'))
```

- [ ] **Step 2: Swap 5 routes inside App()**

Replace these 5 route elements (leave `ProtectedRoute` / `AdminProtectedRoute` wrappers in place, only change the inner element):

**Login route** — change from:
```tsx
<Route path="/login" element={<LoginPage />} />
```
to:
```tsx
<Route path="/login" element={<MobileRoute desktop={LoginPage} mobile={MobileLoginPage} />} />
```

**Analyze route** — change from:
```tsx
<DatasetPromptPage />
```
to:
```tsx
<MobileRoute desktop={DatasetPromptPage} mobile={MobileDatasetPromptPage} />
```

**History route** — change from:
```tsx
<HistoryPage />
```
to:
```tsx
<MobileRoute desktop={HistoryPage} mobile={MobileHistoryPage} />
```

**Plan report route** — change from:
```tsx
<PlanReportPage />
```
to:
```tsx
<MobileRoute desktop={PlanReportPage} mobile={MobilePlanReportPage} />
```

**Browse questions route** — change from:
```tsx
<BrowseQuestionsPage />
```
to:
```tsx
<MobileRoute desktop={BrowseQuestionsPage} mobile={MobileBrowseQuestionsPage} />
```

- [ ] **Step 3: Verify TypeScript (mobile page stubs not yet created — expect import errors)**

Mobile pages don't exist yet so tsc will report 5 missing module errors — that's expected. Check there are no *other* errors introduced in App.tsx:

```bash
npx tsc --noEmit 2>&1 | grep -v "mobile/"
```

Expected: no errors outside `mobile/` paths

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire MobileRoute into 5 app routes"
```

---

## Task 4: MobileLoginPage

**Files:**
- Create: `src/pages/mobile/MobileLoginPage.tsx`

Identical logic to `LoginPage.tsx` (same form, same sha256, same service calls). Only the layout changes: logo + title stack vertically, card is full-width, inputs are taller.

- [ ] **Step 1: Create the file**

```tsx
// src/pages/mobile/MobileLoginPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSession } from '../../context/SessionContext'
import { useTheme } from '../../context/ThemeContext'
import { pocketbaseService } from '../../services/mcpPocketbaseService'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
type LoginFormData = z.infer<typeof loginSchema>

function rotr32(v: number, n: number): number {
  return ((v >>> n) | (v << (32 - n))) >>> 0
}
function sha256PureJS(bytes: number[]): string {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ]
  let H: [number,number,number,number,number,number,number,number] = [
    0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19,
  ]
  const origLen = bytes.length
  const padded = [...bytes, 0x80]
  while (padded.length % 64 !== 56) padded.push(0)
  const bitLen = origLen * 8
  padded.push(0,0,0,0,(bitLen>>>24)&0xff,(bitLen>>>16)&0xff,(bitLen>>>8)&0xff,bitLen&0xff)
  for (let b = 0; b < padded.length; b += 64) {
    const W = new Array<number>(64)
    for (let i = 0; i < 16; i++) {
      const j = b + i * 4
      W[i] = ((padded[j]<<24)|(padded[j+1]<<16)|(padded[j+2]<<8)|padded[j+3])>>>0
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr32(W[i-15],7)^rotr32(W[i-15],18)^(W[i-15]>>>3)
      const s1 = rotr32(W[i-2],17)^rotr32(W[i-2],19)^(W[i-2]>>>10)
      W[i] = (W[i-16]+s0+W[i-7]+s1)>>>0
    }
    let [a,b2,c,d,e,f,g,h] = H
    for (let i = 0; i < 64; i++) {
      const S1=rotr32(e,6)^rotr32(e,11)^rotr32(e,25)
      const ch=(e&f)^(~e&g)
      const t1=(h+S1+ch+K[i]+W[i])>>>0
      const S0=rotr32(a,2)^rotr32(a,13)^rotr32(a,22)
      const maj=(a&b2)^(a&c)^(b2&c)
      const t2=(S0+maj)>>>0
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b2;b2=a;a=(t1+t2)>>>0
    }
    H=[(H[0]+a)>>>0,(H[1]+b2)>>>0,(H[2]+c)>>>0,(H[3]+d)>>>0,(H[4]+e)>>>0,(H[5]+f)>>>0,(H[6]+g)>>>0,(H[7]+h)>>>0]
  }
  return H.map(n=>n.toString(16).padStart(8,'0')).join('')
}
async function sha256Hex(text: string): Promise<string> {
  const bytes = Array.from(new TextEncoder().encode(text))
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')
  }
  return sha256PureJS(bytes)
}

function SunIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}
function MoonIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  )
}

export default function MobileLoginPage() {
  const navigate = useNavigate()
  const { login, isLoggedIn } = useSession()
  const { theme, toggleTheme } = useTheme()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  if (isLoggedIn) {
    navigate('/analyze', { replace: true })
    return null
  }

  const onSubmit = async (data: LoginFormData) => {
    setIsSubmitting(true)
    setLoginError(null)
    try {
      const profile = await pocketbaseService.getUserProfile(data.email)
      if (!profile) { setLoginError('Invalid email or password.'); return }
      if (!profile.password_hash) {
        setLoginError('Account not configured. Please contact your administrator.')
        return
      }
      const inputHash = await sha256Hex(data.password)
      if (inputHash !== profile.password_hash) { setLoginError('Invalid email or password.'); return }
      login(data.email, undefined, profile.profile, profile.profiles ?? [])
      navigate('/analyze')
    } catch {
      setLoginError('Unable to sign in. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800 px-4 py-8 transition-colors duration-200">
      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg shadow-md transition-colors duration-200"
        title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        {theme === 'light' ? <MoonIcon /> : <SunIcon />}
      </button>

      {/* Logo + title stacked */}
      <div className="flex flex-col items-center gap-2 mb-8 text-center">
        <img
          src={theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'}
          alt="DataPilot"
          className="h-20 w-auto"
        />
        <span
          className="text-4xl font-bold text-gray-900 dark:text-white"
          style={{ fontFamily: "'Syne', sans-serif" }}
        >
          DataPilot
        </span>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Sign in to analyze your datasets with AI
        </p>
      </div>

      {/* Full-width card */}
      <div className="w-full bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 transition-colors duration-200">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label htmlFor="email" className="label">Email Address</label>
            <input
              {...register('email')}
              type="email"
              id="email"
              autoComplete="email"
              className="input-field py-3"
              placeholder="you@example.com"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <input
              {...register('password')}
              type="password"
              id="password"
              autoComplete="current-password"
              className="input-field py-3"
              placeholder="Enter your password"
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.password.message}</p>
            )}
          </div>
          {loginError && (
            <p className="text-sm text-red-600 dark:text-red-400">{loginError}</p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary w-full py-3"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
        <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            Sign in with your credentials to access your datasets.
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "MobileLoginPage"
```

Expected: no errors for this file

- [ ] **Step 3: Commit**

```bash
git add src/pages/mobile/MobileLoginPage.tsx
git commit -m "feat: add MobileLoginPage with stacked logo layout"
```

---

## Task 5: MobileDatasetPromptPage

**Files:**
- Create: `src/pages/mobile/MobileDatasetPromptPage.tsx`

Same state and handlers as `DatasetPromptPage.tsx`. Layout differences: all controls stacked, dataset preview table omitted (too wide for phones), prompt textarea taller, model picker conditional on `!appSettings?.analyze_model`. Results navigate to `/results` exactly as the desktop does.

- [ ] **Step 1: Create the file**

Copy all state, queries, effects, and handlers verbatim from `src/pages/DatasetPromptPage.tsx` (lines 1–391), then provide this mobile JSX as the return:

```tsx
// src/pages/mobile/MobileDatasetPromptPage.tsx
// ── All imports, constants (WITTY_PHRASES, shuffleArray), and state/handler
// ── logic are identical to DatasetPromptPage.tsx lines 1-391.
// ── Copy them verbatim, then replace the return() with this:

// IMPORTS (adjust paths for mobile/ subdirectory):
import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../../context/SessionContext'
import { useAppSettings } from '../../context/AppSettingsContext'
import { pocketbaseService } from '../../services/mcpPocketbaseService'
import { n8nService } from '../../services/mcpN8nService'
import { mcpN8nApi } from '../../services/api'
import { useAccessibleDatasets } from '../../hooks/useAccessibleDatasets'
import Navigation from '../../components/Navigation'
import type { AnalysisResult, PromptDialogQuestion } from '../../types'

// ── Copy WITTY_PHRASES array, shuffleArray function, all state declarations,
// ── all queries, all useEffects, and all handlers from DatasetPromptPage.tsx
// ── (lines 15-391) verbatim. Only the component name and return() change. ──

export default function MobileDatasetPromptPage() {
  // ... (all state and handlers from DatasetPromptPage, same as desktop) ...

  return (
    <div className="min-h-screen bg-gray-200 dark:bg-gray-950 transition-colors duration-200">
      <Navigation />

      <main className="px-4 py-4 space-y-4">

        {/* Loading / error / empty states */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent mb-4"></div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
          </div>
        ) : datasetsError || modelsError ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">
              {datasetsError
                ? `Failed to load datasets: ${datasetsError instanceof Error ? datasetsError.message : 'Unknown error'}`
                : `Failed to load AI models: ${modelsError instanceof Error ? modelsError.message : 'Unknown error'}`}
            </p>
          </div>
        ) : datasets?.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">No datasets found for your account.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Dataset selector */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">

              {/* Dataset search input */}
              <div>
                <label className="label">Dataset</label>
                <div className="relative" ref={datasetDropdownRef}>
                  <input
                    type="text"
                    value={datasetSearch}
                    onChange={(e) => {
                      setDatasetSearch(e.target.value)
                      setSelectedDatasetId('')
                      setShowDatasetDropdown(true)
                    }}
                    onFocus={() => setShowDatasetDropdown(true)}
                    placeholder="Search datasets..."
                    className="input-field w-full py-3 pr-8"
                    disabled={isAnalyzing}
                    autoComplete="off"
                  />
                  {datasetSearch && !isAnalyzing && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setDatasetSearch('')
                        setSelectedDatasetId('')
                        setShowDatasetDropdown(true)
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      tabIndex={-1}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  {showDatasetDropdown && !isAnalyzing && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                      {filteredDatasets.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No datasets found</div>
                      ) : filteredDatasets.map(d => (
                        <div
                          key={d.id}
                          onMouseDown={() => {
                            setSelectedDatasetId(d.id)
                            setDatasetSearch(d.name)
                            setShowDatasetDropdown(false)
                          }}
                          className={`px-3 py-3 cursor-pointer text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 ${
                            selectedDatasetId === d.id ? 'bg-blue-50 dark:bg-blue-900/30 font-medium' : ''
                          }`}
                        >
                          <div className="text-gray-900 dark:text-gray-100">{d.name}</div>
                          {d.description && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{d.description}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Scope */}
              <div>
                <label className="label">Scope</label>
                <select
                  value={datasetScope}
                  onChange={(e) => setDatasetScope(e.target.value as typeof datasetScope)}
                  className="input-field py-3"
                  disabled={isAnalyzing}
                >
                  <option value="all">All Datasets</option>
                  <option value="mine">My Datasets</option>
                  <option value="company">Company Datasets</option>
                  <option value="unit">Unit Datasets</option>
                  <option value="team">Team Datasets</option>
                </select>
              </div>
            </div>

            {/* Suggested dataset banner */}
            {suggestedDataset && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                  AI suggested: {suggestedDataset.dataset_name}
                  {suggestedDataset.confidence_level && (
                    <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">({suggestedDataset.confidence_level})</span>
                  )}
                </p>
                {suggestedDataset.dataset_desc && (
                  <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">{suggestedDataset.dataset_desc}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDatasetId(suggestedDataset.dataset_id)
                      setDatasetSearch(suggestedDataset.dataset_name)
                      setSuggestedDataset(null)
                    }}
                    className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    Use This Dataset
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuggestedDataset(null)}
                    className="px-4 py-2 text-sm text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Sample questions */}
            {datasetDetail?.sample_questions?.questions && datasetDetail.sample_questions.questions.length > 0 && (
              <div className="overflow-x-auto -mx-4 px-4">
                <div className="flex gap-2 pb-1">
                  {datasetDetail.sample_questions.questions.map(q => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setPrompt(q.question)}
                      className="flex-shrink-0 text-xs px-3 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 bg-white dark:bg-gray-900 transition-colors"
                    >
                      {q.question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Prompt + controls */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
              <div>
                <label htmlFor="prompt" className="label">Your question</label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  className="input-field resize-none"
                  style={{ minHeight: '120px' }}
                  placeholder="What would you like to know about this dataset?"
                  disabled={isAnalyzing}
                />
              </div>

              {/* AI Model — hidden when admin locks it */}
              {!appSettings?.analyze_model && (
                <div>
                  <label htmlFor="aiModel" className="label">AI Model</label>
                  <select
                    id="aiModel"
                    value={selectedModelId}
                    onChange={(e) => handleModelChange(e.target.value)}
                    className="input-field py-3"
                    disabled={isAnalyzing}
                  >
                    {aiModels?.length === 0 ? (
                      <option value="">No models available</option>
                    ) : aiModels?.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name}{model.provider && ` (${model.provider})`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Email response toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="emailResponse"
                  checked={emailResponse}
                  onChange={(e) => setEmailResponse(e.target.checked)}
                  disabled={isAnalyzing}
                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="emailResponse" className="text-sm text-gray-700 dark:text-gray-300">
                  Email me the response
                </label>
              </div>
              {emailResponse && (
                <div>
                  <label htmlFor="emailSubject" className="label">Subject (optional)</label>
                  <input
                    id="emailSubject"
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    disabled={isAnalyzing}
                    placeholder="(optional)"
                    className="input-field py-3"
                  />
                </div>
              )}

              {/* Loading phrase */}
              {isAnalyzing && (
                <p className="text-sm text-center text-gray-400 dark:text-gray-500 italic py-2">
                  {getCurrentPhrase()} — {elapsedSeconds}s
                </p>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleLetAiAsk}
                  disabled={isAnalyzing || dialogLoading || !prompt.trim()}
                  className="flex-1 py-3 text-sm font-medium text-purple-800 dark:text-purple-200 bg-purple-100 dark:bg-purple-900/30 border border-purple-400 dark:border-purple-600 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {dialogLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-purple-500 border-t-transparent" />
                      Thinking...
                    </span>
                  ) : 'Let AI Ask'}
                </button>
                <button
                  type="submit"
                  disabled={isAnalyzing || isSelectingDataset}
                  className="flex-1 py-3 text-sm font-medium text-white bg-purple-900 hover:bg-purple-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isAnalyzing ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Analyzing...
                    </span>
                  ) : isSelectingDataset ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Finding dataset...
                    </span>
                  ) : 'Ask'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Prompt dialog modal — identical to desktop */}
        {dialogOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-5 w-full max-w-lg max-h-[80vh] overflow-y-auto">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                Help us understand your question
              </h3>
              <div className="space-y-4">
                {dialogQuestions.map(q => (
                  <div key={q.id}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      {q.question}
                    </label>
                    {q.hints && q.hints.length > 0 ? (
                      <div className="relative">
                        <select
                          value={dialogAnswers[q.id] || ''}
                          onChange={(e) => setDialogAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                          className="input-field py-3"
                        >
                          <option value="">Select an option...</option>
                          {q.hints.map((h, i) => (
                            <option key={i} value={h}>{h}</option>
                          ))}
                          <option value="__custom__">Other (type below)</option>
                        </select>
                        {dialogAnswers[q.id] === '__custom__' && (
                          <input
                            type="text"
                            className="input-field py-3 mt-2"
                            placeholder="Type your answer..."
                            onChange={(e) => setDialogAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                          />
                        )}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={dialogAnswers[q.id] || ''}
                        onChange={(e) => setDialogAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                        className="input-field py-3"
                        placeholder="Your answer..."
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setDialogOpen(false)}
                  className="flex-1 py-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDialogSubmit}
                  disabled={isAnalyzing}
                  className="flex-1 py-3 text-sm font-medium text-white bg-purple-900 hover:bg-purple-800 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {isAnalyzing ? 'Analyzing...' : 'Submit & Ask'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "MobileDatasetPromptPage"
```

Expected: no errors for this file

- [ ] **Step 3: Commit**

```bash
git add src/pages/mobile/MobileDatasetPromptPage.tsx
git commit -m "feat: add MobileDatasetPromptPage with stacked controls layout"
```

---

## Task 6: MobilePlanReportPage

**Files:**
- Create: `src/pages/mobile/MobilePlanReportPage.tsx`

Identical state, queries, and all handlers to `PlanReportPage.tsx` (lines 241–1530). Only the return JSX changes. The schedule section is hidden behind a collapsible toggle controlled by a new `scheduleOpen` boolean state.

- [ ] **Step 1: Create the file**

Copy everything from `src/pages/PlanReportPage.tsx` lines 1–1530 (all imports, helper functions, and state/handler logic). Update import paths to use `../../` prefix. Rename the export to `MobilePlanReportPage`. Add one extra state var at the top of the component: `const [scheduleOpen, setScheduleOpen] = useState(false)`. Then replace the `return()` with:

```tsx
// Return for MobilePlanReportPage — paste after all state + handlers

  return (
    <div className="min-h-screen bg-gray-200 dark:bg-gray-950">
      <Navigation />

      <main className="px-4 py-4 space-y-4">

        {/* ── Input form ── */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">

            {/* Prompt */}
            <div>
              <label className="label">Report Description</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="input-field resize-none"
                style={{ minHeight: '96px' }}
                placeholder="Describe what the report should cover, key metrics, comparisons..."
                disabled={isWorking}
              />
            </div>

            {/* Dataset list with search */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">
                  Datasets — optional ({selectedDatasetIds.size} selected)
                </label>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                  disabled={isWorking}
                >
                  {selectedDatasetIds.size === datasets?.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <input
                type="text"
                value={datasetSearch}
                onChange={(e) => setDatasetSearch(e.target.value)}
                placeholder="Search datasets..."
                className="input-field py-3 mb-2"
                disabled={isWorking}
              />
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg divide-y divide-gray-200 dark:divide-gray-600 max-h-48 overflow-y-auto">
                {[...(datasets ?? [])]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .filter(d => d.name.toLowerCase().includes(datasetSearch.toLowerCase()))
                  .map(dataset => (
                    <label
                      key={dataset.id}
                      className={`flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                        selectedDatasetIds.has(dataset.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDatasetIds.has(dataset.id)}
                        onChange={() => toggleDataset(dataset.id)}
                        disabled={isWorking}
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {dataset.name}
                          {dataset.row_count != null && (
                            <span className="text-gray-400 dark:text-gray-500 font-normal">
                              {' '}({dataset.row_count.toLocaleString()} rows)
                            </span>
                          )}
                        </p>
                        {dataset.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{dataset.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
              </div>
            </div>

            {/* Detail level + Plan model side-by-side */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="label">Detail Level</label>
                <select
                  value={detailLevel}
                  onChange={(e) => setDetailLevel(e.target.value)}
                  className="input-field py-3"
                  disabled={isWorking}
                >
                  <option value="None">None</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              {!appSettings?.plan_model && (
                <div className="flex-1">
                  <label className="label">Plan Model</label>
                  <select
                    value={selectedPlanModelId}
                    onChange={(e) => handlePlanModelChange(e.target.value)}
                    className="input-field py-3"
                    disabled={isWorking}
                  >
                    {aiModels?.length === 0 ? (
                      <option value="">No models</option>
                    ) : aiModels?.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Plan button */}
            <button
              type="submit"
              disabled={isWorking || !prompt.trim()}
              className="btn-primary w-full py-3"
            >
              {planMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Generating Plan...
                </span>
              ) : 'Plan Report'}
            </button>
          </div>
        </form>

        {/* ── Report Plan ── */}
        {plan && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Report Plan</h2>
            <div className="space-y-2">
              {plan.steps.map(step => {
                const progress = executionProgress?.steps?.find(s => s.step_number === step.step_number)
                const statusColor =
                  progress?.status === 'completed' ? 'bg-green-500' :
                  progress?.status === 'error' ? 'bg-red-500' :
                  progress?.status === 'started' ? 'bg-blue-500' :
                  'bg-gray-300 dark:bg-gray-600'
                return (
                  <div
                    key={step.step_number}
                    className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50"
                  >
                    <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        Step {step.step_number}: {step.purpose}
                      </p>
                      {step.dataset_id && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {datasets?.find(d => d.id === step.dataset_id)?.name ?? step.dataset_id}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Execute model + button */}
            {!appSettings?.execute_model && (
              <div>
                <label className="label">Execute Model</label>
                <select
                  value={selectedExecuteModelId}
                  onChange={(e) => handleExecuteModelChange(e.target.value)}
                  className="input-field py-3"
                  disabled={isExecuting}
                >
                  {aiModels?.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              onClick={handleExecute}
              disabled={isWorking}
              className="w-full py-3 text-sm font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-700 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isExecuting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-500 border-t-transparent" />
                  Executing...
                </span>
              ) : 'Execute Report'}
            </button>
          </div>
        )}

        {/* ── Report Output ── */}
        {report && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Report</h2>
              {reportSaved ? (
                <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
              ) : (
                <button
                  type="button"
                  onClick={handleSaveReport}
                  disabled={isSavingReport}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 disabled:opacity-50"
                >
                  {isSavingReport ? 'Saving...' : 'Save Report'}
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <iframe
                ref={reportRef as React.RefObject<HTMLIFrameElement>}
                srcDoc={report}
                className="w-full rounded border border-gray-200 dark:border-gray-700"
                style={{ minHeight: '400px', height: 'auto' }}
                title="Report"
              />
            </div>
          </div>
        )}

        {/* ── Schedule section (collapsible) ── */}
        {(savedRecordId || scheduleConversationId) && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setScheduleOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                📅 Schedule this report
                {reportSchedules.length > 0 && (
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                    ({reportSchedules.length} active)
                  </span>
                )}
              </span>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${scheduleOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {scheduleOpen && (
              <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800">
                {/* Existing schedules */}
                {reportSchedules.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {reportSchedules.map(schedule => (
                      <div
                        key={schedule.id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-sm"
                      >
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{schedule.schedule}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{schedule.timezone}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteSchedule(schedule.id)}
                          className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add schedule form */}
                {!scheduleFormOpen ? (
                  <button
                    type="button"
                    onClick={() => setScheduleFormOpen(true)}
                    className="w-full py-2.5 text-sm text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 border-dashed rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    + Add Schedule
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="label">Frequency</label>
                      <select
                        value={scheduleForm.scheduleType}
                        onChange={(e) => setScheduleForm(f => ({ ...f, scheduleType: e.target.value as typeof f.scheduleType }))}
                        className="input-field py-3"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="custom">Custom Cron</option>
                      </select>
                    </div>
                    {scheduleForm.scheduleType !== 'custom' && (
                      <div>
                        <label className="label">Time</label>
                        <input
                          type="time"
                          value={scheduleForm.time}
                          onChange={(e) => setScheduleForm(f => ({ ...f, time: e.target.value }))}
                          className="input-field py-3"
                        />
                      </div>
                    )}
                    {scheduleForm.scheduleType === 'weekly' && (
                      <div>
                        <label className="label">Day of Week</label>
                        <select
                          value={scheduleForm.dayOfWeek ?? 1}
                          onChange={(e) => setScheduleForm(f => ({ ...f, dayOfWeek: Number(e.target.value) }))}
                          className="input-field py-3"
                        >
                          {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i) => (
                            <option key={i} value={i}>{d}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {scheduleForm.scheduleType === 'monthly' && (
                      <div>
                        <label className="label">Day of Month</label>
                        <input
                          type="number"
                          min={1} max={28}
                          value={scheduleForm.dayOfMonth ?? 1}
                          onChange={(e) => setScheduleForm(f => ({ ...f, dayOfMonth: Number(e.target.value) }))}
                          className="input-field py-3"
                        />
                      </div>
                    )}
                    {scheduleForm.scheduleType === 'custom' && (
                      <div>
                        <label className="label">Cron Expression</label>
                        <input
                          type="text"
                          value={scheduleForm.customCron ?? ''}
                          onChange={(e) => setScheduleForm(f => ({ ...f, customCron: e.target.value }))}
                          placeholder="0 9 * * 1"
                          className="input-field py-3"
                        />
                      </div>
                    )}
                    <div>
                      <label className="label">Timezone</label>
                      <select
                        value={scheduleForm.timezone}
                        onChange={(e) => setScheduleForm(f => ({ ...f, timezone: e.target.value }))}
                        className="input-field py-3"
                      >
                        {COMMON_TIMEZONES.map(tz => (
                          <option key={tz.value} value={tz.value}>{tz.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="replanOnRun"
                        checked={scheduleForm.replanOnRun}
                        onChange={(e) => setScheduleForm(f => ({ ...f, replanOnRun: e.target.checked }))}
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="replanOnRun" className="text-sm text-gray-700 dark:text-gray-300">
                        Re-plan on each run
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setScheduleFormOpen(false)}
                        className="flex-1 py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveSchedule}
                        className="flex-1 py-2.5 text-sm font-medium text-white bg-purple-900 hover:bg-purple-800 rounded-lg transition-colors"
                      >
                        Save Schedule
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
```

**Handler reference (verified against PlanReportPage.tsx):** `handleSubmit` (form onSubmit, line 1407), `handleExecute` (line 1481), `handleSaveReport` (line 850), `handleDeleteSchedule` (line 960), `handleSaveSchedule` (line 905), `isWorking` (const at line 1384: `planMutation.isPending || isExecuting`), `planMutation` (line 1100), `toggleAll` (line 1398), `toggleDataset` (line 1386). `COMMON_TIMEZONES` is defined at lines 33-47 and will be included when copying. For the report iframe, the desktop uses a `reportRef` (`useRef<HTMLDivElement>`) for scroll-into-view — the mobile version uses `srcDoc={report}` on a plain `<iframe>` without the designMode editor, so `reportRef` is not needed in the mobile return.

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "MobilePlanReportPage"
```

Expected: no errors for this file. Fix any name mismatches found.

- [ ] **Step 3: Commit**

```bash
git add src/pages/mobile/MobilePlanReportPage.tsx
git commit -m "feat: add MobilePlanReportPage with collapsible schedule section"
```

---

## Task 7: MobileHistoryPage

**Files:**
- Create: `src/pages/mobile/MobileHistoryPage.tsx`

Shares all query, mutation, and helper logic with `HistoryPage.tsx`. Simplification for mobile: **bulk selection is removed** (no checkboxes, no select-all, no bulk delete). Single-conversation actions (Load into Analyze, Send Report, Save as Question, Delete) appear in the expanded card. Send Report for a single conversation uses a simple inline email input.

- [ ] **Step 1: Create the file**

```tsx
// src/pages/mobile/MobileHistoryPage.tsx
import { useState, useMemo, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useSession } from '../../context/SessionContext'
import { useAppSettings } from '../../context/AppSettingsContext'
import { pocketbaseService } from '../../services/mcpPocketbaseService'
import { n8nService } from '../../services/mcpN8nService'
import Navigation from '../../components/Navigation'
import ReportHtml from '../../components/ReportHtml'
import SaveQuestionModal from '../../components/SaveQuestionModal'
import type { ConversationHistory } from '../../types'

type ViewMode = 'by-date' | 'by-dataset'
type ItemType = 'conversation' | 'report' | 'both'

interface GroupedConversations { [key: string]: ConversationHistory[] }

export default function MobileHistoryPage() {
  const { session } = useSession()
  const { appSettings } = useAppSettings()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [viewMode, setViewMode] = useState<ViewMode>('by-date')
  const [itemType, setItemType] = useState<ItemType>('both')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [expandedConversation, setExpandedConversation] = useState<string | null>(null)
  const [showSaveModal, setShowSaveModal] = useState<ConversationHistory | null>(null)

  // Single-conversation send state
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sendEmail, setSendEmail] = useState('')
  const [isSending, setIsSending] = useState(false)

  const {
    data: conversations,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['conversation-history', session?.email],
    queryFn: () => pocketbaseService.getConversationHistory(session!.email),
    enabled: !!session?.email,
  })

  const { data: userProfile } = useQuery({
    queryKey: ['user-profile', session?.email],
    queryFn: () => pocketbaseService.getUserProfile(session!.email),
    enabled: !!session?.email,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pocketbaseService.deleteConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-history'] })
      toast.success('Conversation deleted')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete conversation')
    },
  })

  const userTimezone = userProfile?.user_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone

  const toDate = (s: string): Date | null => {
    if (!s) return null
    let normalized = s.includes('T') ? s : s.replace(' ', 'T')
    if (!/[Zz]/.test(normalized) && !/[+-]\d{2}:\d{2}$/.test(normalized)) normalized += 'Z'
    const d = new Date(normalized)
    return isNaN(d.getTime()) ? null : d
  }

  const toDateKey = (d: Date): string =>
    d.toLocaleDateString('sv-SE', { timeZone: userTimezone })

  const getDateFromCreated = (created: string): string => {
    const d = toDate(created)
    return d ? toDateKey(d) : 'Unknown Date'
  }

  const parsePromptType = (prompt: string | null | undefined): { type: string | null; displayPrompt: string } => {
    if (!prompt) return { type: null, displayPrompt: '' }
    const match = prompt.match(/^\[(Conversation|Execute Plan|Plan Report|Scheduled)\]\s*(.*)$/s)
    if (match) return { type: match[1], displayPrompt: match[2] }
    return { type: null, displayPrompt: prompt }
  }

  const formatDate = (dateKey: string) => {
    if (!dateKey || dateKey === 'Unknown Date') return dateKey
    try {
      const [y, m, d] = dateKey.split('-').map(Number)
      const date = new Date(y, m - 1, d)
      if (isNaN(date.getTime())) return dateKey
      return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    } catch { return dateKey }
  }

  const formatTime = (created: string) => {
    if (!created) return ''
    try {
      const d = toDate(created)
      if (!d) return ''
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: userTimezone })
    } catch { return '' }
  }

  const filteredConversations = useMemo(() => {
    if (!conversations) return []
    let filtered = conversations
    if (itemType === 'conversation') filtered = filtered.filter(c => !c.report_id)
    else if (itemType === 'report') filtered = filtered.filter(c => !!c.report_id)
    if (!searchQuery.trim()) return filtered
    const q = searchQuery.toLowerCase()
    return filtered.filter(c => {
      const { displayPrompt } = parsePromptType(c.prompt)
      return (
        displayPrompt.toLowerCase().includes(q) ||
        (c.response ?? '').toLowerCase().includes(q) ||
        (c.dataset_name ?? '').toLowerCase().includes(q)
      )
    })
  }, [conversations, searchQuery, itemType])

  const groupedByDate = useMemo(() => {
    const grouped: GroupedConversations = {}
    filteredConversations.forEach(conv => {
      const date = getDateFromCreated(conv.created)
      if (!grouped[date]) grouped[date] = []
      grouped[date].push(conv)
    })
    return grouped
  }, [filteredConversations, userTimezone])

  const groupedByDataset = useMemo(() => {
    const grouped: GroupedConversations = {}
    filteredConversations.forEach(conv => {
      const ds = conv.dataset_name
      if (!grouped[ds]) grouped[ds] = []
      grouped[ds].push(conv)
    })
    return grouped
  }, [filteredConversations])

  const dates = useMemo(() => Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a)), [groupedByDate])
  const dsKeys = useMemo(() => Object.keys(groupedByDataset).sort(), [groupedByDataset])

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this conversation?')) deleteMutation.mutate(id)
  }

  const handleLoadIntoPlan = (conv: ConversationHistory) => {
    navigate('/plan-report', { state: {
      prompt: conv.prompt ?? '',
      reportPlan: conv.report_plan ?? '',
      report: conv.response ?? '',
      reportId: conv.report_id ?? '',
      datasetId: conv.dataset_id ?? '',
      datasetName: conv.dataset_name ?? '',
      aiModel: conv.ai_model ?? '',
      savedRecordId: conv.id,
    }})
  }

  const handleSendSingle = async (conv: ConversationHistory) => {
    const emails = sendEmail.split(/[,;\s]+/).map(e => e.trim()).filter(Boolean)
    if (emails.length === 0) { toast.error('Enter at least one email'); return }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (emails.some(e => !emailRegex.test(e))) { toast.error('Invalid email format'); return }
    setIsSending(true)
    try {
      const content = `Dataset: ${conv.dataset_name}\n\nPROMPT:\n${conv.prompt}\n\nRESPONSE:\n${conv.response}`
      await n8nService.sendReport({
        emails,
        content,
        review: false,
        templateId: userProfile?.template_id,
        ...(appSettings?.report_model && { model: appSettings.report_model }),
      })
      toast.success('Report sent!')
      setSendingId(null)
      setSendEmail('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send report')
    } finally {
      setIsSending(false)
    }
  }

  const getTypeBadgeStyle = (type: string) => {
    switch (type) {
      case 'Conversation': return 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
      case 'Execute Plan': return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
      case 'Plan Report': return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
    }
  }

  const renderCard = (conv: ConversationHistory) => {
    const isExpanded = expandedConversation === conv.id
    const { type: promptType, displayPrompt } = parsePromptType(conv.prompt)
    const isSendingThis = sendingId === conv.id

    return (
      <div key={conv.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Card header — tappable */}
        <div
          className="p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 active:bg-gray-100 dark:active:bg-gray-700"
          onClick={() => setExpandedConversation(isExpanded ? null : conv.id)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 leading-snug">
                {displayPrompt || '(no prompt)'}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {promptType && (
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getTypeBadgeStyle(promptType)}`}>
                    {promptType}
                  </span>
                )}
                {conv.report_id && !promptType && (
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                    Report
                  </span>
                )}
                <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{conv.dataset_name}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{formatTime(conv.created)}</span>
              </div>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-gray-100 dark:border-gray-700">
            {/* Response */}
            <div className="p-3 max-h-72 overflow-y-auto">
              {conv.report_id ? (
                <ReportHtml html={conv.response ?? ''} />
              ) : (
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {conv.response ?? '(no response)'}
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="px-3 pb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('/analyze', { state: { preSelectedDatasetId: conv.dataset_id } })}
                className="flex-1 py-2 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
              >
                Load into Analyze
              </button>
              {conv.report_id && (
                <button
                  type="button"
                  onClick={() => handleLoadIntoPlan(conv)}
                  className="flex-1 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
                >
                  Load into Plan
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSaveModal(conv)}
                className="flex-1 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Save Question
              </button>
              <button
                type="button"
                onClick={() => {
                  if (sendingId === conv.id) { setSendingId(null); setSendEmail('') }
                  else { setSendingId(conv.id); setSendEmail('') }
                }}
                className="flex-1 py-2 text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
              >
                Send Report
              </button>
              <button
                type="button"
                onClick={() => handleDelete(conv.id)}
                disabled={deleteMutation.isPending}
                className="py-2 px-3 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors"
              >
                Delete
              </button>
            </div>

            {/* Inline send form */}
            {isSendingThis && (
              <div className="px-3 pb-3 pt-0 border-t border-gray-100 dark:border-gray-700 space-y-2">
                <input
                  type="email"
                  value={sendEmail}
                  onChange={(e) => setSendEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  className="input-field py-3"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleSendSingle(conv)}
                  disabled={isSending || !sendEmail.trim()}
                  className="w-full py-2.5 text-sm font-medium text-white bg-purple-900 hover:bg-purple-800 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {isSending ? 'Sending...' : 'Send'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const groups = viewMode === 'by-date' ? dates : dsKeys
  const grouped = viewMode === 'by-date' ? groupedByDate : groupedByDataset

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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search history..."
            className="w-full pl-9 pr-4 py-3 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-400"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {(['both', 'conversation', 'report'] as ItemType[]).map(type => (
            <button
              key={type}
              type="button"
              onClick={() => setItemType(type)}
              className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                itemType === type
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'
              }`}
            >
              {type === 'both' ? 'All' : type === 'conversation' ? 'Questions' : 'Reports'}
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          {(['by-date', 'by-dataset'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                viewMode === mode
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {mode === 'by-date' ? 'By Date' : 'By Dataset'}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-sm text-red-600 dark:text-red-400">
              {error instanceof Error ? error.message : 'Failed to load history'}
            </p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {searchQuery ? 'No results found.' : 'No history yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(groupKey => {
              const items = grouped[groupKey] ?? []
              if (items.length === 0) return null
              const isOpen = expandedGroups.has(groupKey)
              const label = viewMode === 'by-date' ? formatDate(groupKey) : groupKey
              return (
                <div key={groupKey}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupKey)}
                    className="w-full flex items-center justify-between py-1.5 text-left"
                  >
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {label}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{items.length}</span>
                  </button>
                  {(!expandedGroups.size || isOpen) && (
                    <div className="space-y-2">
                      {items.map(conv => renderCard(conv))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Save Question modal — reuse desktop component */}
      {showSaveModal && (
        <SaveQuestionModal
          conversation={showSaveModal}
          onClose={() => setShowSaveModal(null)}
        />
      )}
    </div>
  )
}
```

**Note on initial group expansion:** The desktop History page uses `expandedGroups` as a set and groups are collapsed by default. The mobile render above shows all groups open if none are explicitly collapsed (`!expandedGroups.size || isOpen`). This means all groups start open. If you want groups collapsed by default (tapping label expands), change the condition to `isOpen` alone and pre-open the first group in a `useEffect`: `useEffect(() => { if (dates.length > 0) setExpandedGroups(new Set([dates[0]])) }, [dates.length])`.

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "MobileHistoryPage"
```

Expected: no errors for this file

- [ ] **Step 3: Commit**

```bash
git add src/pages/mobile/MobileHistoryPage.tsx
git commit -m "feat: add MobileHistoryPage with tap-to-expand cards"
```

---

## Task 8: MobileBrowseQuestionsPage

**Files:**
- Create: `src/pages/mobile/MobileBrowseQuestionsPage.tsx`

Same query and scoring logic as `BrowseQuestionsPage.tsx`. The collapsible org-tree is replaced with horizontal filter chips (All / My Company / My Unit / My Team). `QuestionCard` component is reused verbatim.

- [ ] **Step 1: Create the file**

```tsx
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

export default function MobileBrowseQuestionsPage() {
  const { session } = useSession()
  const [search, setSearch] = useState('')
  const [orgFilter, setOrgFilter] = useState<OrgFilter>('all')

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['browse-questions', session?.email],
    queryFn: () => pocketbaseService.browseSavedQuestions(session!.email),
    enabled: !!session?.email,
  })

  const userProfile = parseProfile(session?.profile)
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

    // Search filter
    if (!term) return list
    return list.filter(q => score(q, term) > 0).sort((a, b) => score(b, term) - score(a, term))
  }, [questions, term, orgFilter, userProfile])

  const chips: { id: OrgFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'company', label: 'My Company' },
    { id: 'unit', label: 'My Unit' },
    { id: 'team', label: 'My Team' },
  ]

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
            placeholder="Search questions, datasets, or users…"
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
          {chips.map(chip => (
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "MobileBrowseQuestionsPage"
```

Expected: no errors for this file

- [ ] **Step 3: Commit**

```bash
git add src/pages/mobile/MobileBrowseQuestionsPage.tsx
git commit -m "feat: add MobileBrowseQuestionsPage with org filter chips"
```

---

## Task 9: Full Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript full check**

```bash
npx tsc --noEmit
```

Expected: 0 errors. If errors appear, fix them before continuing.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: 0 errors. Fix any lint errors reported (unused imports are the most common).

- [ ] **Step 3: Build the app**

```bash
npm run build
```

Expected: Build completes successfully. Vite will show 5 additional lazy chunks for the mobile pages.

- [ ] **Step 4: Manual smoke test on mobile viewport**

```bash
npm run dev
```

Open http://localhost:5173 in a browser. Open DevTools → Toggle device toolbar → select a phone preset (e.g. iPhone 12 — 390px width).

Check each route:
- `/login` — logo and title stacked vertically, full-width card visible
- `/analyze` — Dataset / Question / (Model if unlocked) / Ask stacked, no horizontal overflow
- `/plan-report` — Detail + Model side-by-side, Schedule section collapsed behind toggle
- `/history` — Search bar, filter chips, By Date / By Dataset toggle, conversation cards
- `/browse-questions` — Search bar, org filter chips, question cards

Switch to tablet size (768px or wider) — confirm all 5 routes show the original desktop layouts.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete mobile experience for 5 core pages

Adds useIsMobile hook, MobileRoute wrapper, and dedicated mobile layouts
for Login, Quick Answer, Plan Report, History, and Browse Questions.
Phones (< 768px) get optimized single-scroll layouts; tablets and
desktop see existing pages unchanged."
```
