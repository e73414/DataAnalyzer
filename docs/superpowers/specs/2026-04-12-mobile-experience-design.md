# Mobile Experience Design

**Date:** 2026-04-12  
**Scope:** Dedicated mobile layouts for 5 pages — Login, Quick Answer, Plan Report, History, Browse Questions  
**Status:** Approved

---

## Overview

Mobile phone users (viewport < 768px) receive dedicated page components optimised for small screens. Tablet users (≥ 768px) continue to receive the existing desktop pages unchanged. All mobile pages are feature-complete — no functionality is removed.

---

## Architecture

### Detection

**`src/hooks/useIsMobile.ts`**  
Reads `window.matchMedia('(max-width: 767px)')` synchronously on mount, then subscribes to resize events. Returns a single `boolean`. Because `matchMedia` resolves synchronously, there is no layout flash on load.

### Routing wrapper

**`src/components/MobileRoute.tsx`**  
A wrapper component (analogous to the existing `ProtectedRoute`) that accepts two props:

```tsx
interface MobileRouteProps {
  desktop: React.ComponentType
  mobile: React.LazyExoticComponent<React.ComponentType>
}
```

- Calls `useIsMobile()`
- Renders `<desktop />` for tablet/desktop viewports
- Renders `<Suspense fallback={<LoadingSpinner />}><mobile /></Suspense>` for phone viewports
- Mobile components are React lazy imports so they are not bundled into the desktop chunk

### App.tsx changes

Five routes change from:
```tsx
<ProtectedRoute><DatasetPromptPage /></ProtectedRoute>
```
to:
```tsx
<ProtectedRoute>
  <MobileRoute desktop={DatasetPromptPage} mobile={MobileDatasetPromptPage} />
</ProtectedRoute>
```

Login (unprotected) follows the same pattern without `ProtectedRoute`.

### Mobile page files

All mobile pages live in `src/pages/mobile/`:

```
src/pages/mobile/
  MobileLoginPage.tsx
  MobileDatasetPromptPage.tsx
  MobilePlanReportPage.tsx
  MobileHistoryPage.tsx
  MobileBrowseQuestionsPage.tsx
```

Each mobile page imports the same services, hooks, context, and business logic as its desktop counterpart. Only the JSX layout differs — no logic duplication.

---

## Shared Mobile Conventions

- **Navigation**: The existing `Navigation` component is used unchanged on all authenticated pages. It already works at narrow widths (dropdown menu, theme toggle, settings gear).
- **Touch targets**: All interactive inputs use `py-3` (≥ 44px height) for comfortable thumb interaction.
- **Padding**: `px-4` throughout — no horizontal overflow.
- **Stacked layout**: All controls flow vertically in a single scroll. No sidebars or multi-column layouts.
- **Dark mode**: All mobile pages respect the existing `ThemeContext` and Tailwind `dark:` classes.
- **Model pickers**: Shown/hidden using the identical `appSettings` conditions as the desktop pages (see per-page details below).

---

## Per-Page Layouts

### MobileLoginPage

Replaces `LoginPage` on phones.

**Layout (top to bottom):**
1. Theme toggle — fixed top-right (unchanged from desktop)
2. Logo image + "DataPilot" title — stacked vertically, centred
3. Subtitle text
4. White card containing:
   - Email input (`py-3`)
   - Password input (`py-3`)
   - Error message (if any)
   - Full-width Sign In button

No functional changes — same `useForm` / `zodResolver` / `sha256Hex` / `pocketbaseService.getUserProfile` logic.

---

### MobileDatasetPromptPage

Replaces `DatasetPromptPage` (`/analyze`) on phones.

**Layout (top to bottom):**
1. `<Navigation />` header
2. Content area (`px-4 py-4`), stacked:
   - Dataset selector (full-width dropdown/search)
   - Question textarea (taller — `min-h-[120px]` — for thumb typing)
   - AI Model selector — **only rendered when `!appSettings?.analyze_model`**
   - Ask button (full-width)
3. Results section (scrolls below the form):
   - Witty loading phrase while analyzing
   - Result content rendered full-width
   - Action buttons (copy, save, etc.) below the result

All existing logic — dataset filtering, prompt dialog questions, `n8nService` calls, `WITTY_PHRASES` cycling — is reused unchanged.

---

### MobilePlanReportPage

Replaces `PlanReportPage` (`/plan-report`) on phones.

**Layout (top to bottom):**
1. `<Navigation />` header
2. Input section (`px-4 py-4`), stacked:
   - Dataset selector (full-width)
   - Report prompt textarea
   - Detail level + Plan AI Model dropdowns — **side-by-side** (`flex gap-2`) to conserve vertical space
     - Plan model only rendered when `!appSettings?.plan_model`
   - "Plan Report" button (full-width)
3. Report plan section (appears after planning):
   - Steps rendered as a vertical bordered list (left-accent style)
   - Execute AI Model selector — only rendered when `!appSettings?.execute_model`
   - "Execute Report" button (full-width)
4. Report output — full-width HTML render below
5. Schedule section — collapsed behind a "📅 Schedule this report" toggle row; expands inline when tapped

All existing logic — chunked SQL execution, progress polling, plan parsing, report saving — is reused unchanged.

---

### MobileHistoryPage

Replaces `HistoryPage` (`/history`) on phones.

**Layout (top to bottom):**
1. `<Navigation />` header
2. Controls bar (`px-4 py-3`):
   - Full-width search input
   - Horizontal scrolling filter chips: **All / Questions / Reports** (maps to existing `itemType` state)
   - Segmented toggle: **By Date / By Dataset** (maps to existing `viewMode` state)
3. Conversation list — vertical stack of tappable cards:
   - Each card shows: prompt (2-line clamp), dataset name + timestamp, type badge (Question / Report)
   - Tapping a card expands it inline to show the full result / report HTML
   - Expanded card shows action buttons: Load into Analyze, Send Report, Save as Question, Delete

All existing query, mutation, grouping, and email-sending logic is reused unchanged.

---

### MobileBrowseQuestionsPage

Replaces `BrowseQuestionsPage` (`/browse-questions`) on phones.

**Layout (top to bottom):**
1. `<Navigation />` header
2. Controls (`px-4 py-3`):
   - Full-width search input
   - Horizontal scrolling org-filter chips: **All / My Company / My Unit / My Team** (maps to existing profile-based filtering)
3. Question cards — vertical stack:
   - Same `QuestionCard` structure as desktop (prompt, dataset badge, editable/auto-run badge, Open button)
   - Cards already compact; minimal layout change needed

All existing scoring, filtering, and navigation logic is reused unchanged.

---

## What Is Not Changing

- Desktop pages — untouched, no modifications
- `Navigation.tsx` — used as-is on all mobile authenticated pages
- All services, hooks, context providers, and types
- URL routes — same paths, no `/m/` prefix or redirects
- Tablet users (≥ 768px) — see the existing desktop pages

---

## File Change Summary

| File | Change |
|---|---|
| `src/hooks/useIsMobile.ts` | **New** — matchMedia hook |
| `src/components/MobileRoute.tsx` | **New** — desktop/mobile routing wrapper |
| `src/pages/mobile/MobileLoginPage.tsx` | **New** |
| `src/pages/mobile/MobileDatasetPromptPage.tsx` | **New** |
| `src/pages/mobile/MobilePlanReportPage.tsx` | **New** |
| `src/pages/mobile/MobileHistoryPage.tsx` | **New** |
| `src/pages/mobile/MobileBrowseQuestionsPage.tsx` | **New** |
| `src/App.tsx` | **Edit** — 5 routes updated to use `MobileRoute` |
