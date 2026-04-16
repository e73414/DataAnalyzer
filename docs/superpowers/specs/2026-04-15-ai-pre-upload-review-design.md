# AI Pre-Upload Review — Design Spec

**Date:** 2026-04-15
**Status:** Approved
**Scope:** CSV Optimizer Plus — AI-driven data cleaning before upload

---

## Overview

After the CSV Optimizer Plus conversion completes, users can trigger an AI Review that analyzes the converted data, produces a structured cleaning plan (header merges, data island removal, row exclusions, column renames), and automatically applies it via a new Python cleaning endpoint. The cleaned data then flows into the existing upload flow. This feature replaces the existing optional `AiReviewPage` post-upload step.

---

## Architecture & Flow

```
CsvOptimizerPlusPage
  │
  ├── [existing] POST /excel-to-sql/convert
  │         └── Returns ZIP (clean CSV, profile, schema)
  │
  ├── [NEW] "AI Review" button appears after conversion succeeds
  │
  ├── [NEW] POST /mcp-n8n → ai-analyze webhook (extended)
  │         ├── Sends: first 20 raw rows, headers, dataBlocks, rowCount
  │         └── Returns: cleaning plan JSON
  │                 ├── header_merges  (merged cell → combined column names)
  │                 ├── data_islands   (row/col ranges to discard)
  │                 ├── rows_to_exclude
  │                 └── column_renames
  │
  ├── [NEW] AiReviewModal — shows human-readable plan, "Accept & Clean"
  │
  ├── [NEW] POST /excel-to-sql/clean
  │         ├── Sends: converted CSV + cleaning plan JSON
  │         └── Returns: cleaned CSV + changes_applied summary
  │
  └── [modified] "Continue to Upload" → UploadDatasetPage with cleaned data
                  (AiReviewPage removed from this flow)
```

**Key principle:** The LLM produces a structured plan only — it never generates executable code. Python applies the plan deterministically.

---

## Frontend Changes

### `CsvOptimizerPlusPage.tsx` (modified)

- After conversion ZIP is parsed, render an **"AI Review" button** alongside "Continue to Upload"
- On click: call the extended `/ai-analyze` n8n webhook with `rawFirstRows` (first 20 rows), `headers`, `dataBlocks`, and `rowCount`
- Show a loading spinner on the button during analysis (10–30s expected)
- On response: open `AiReviewModal` with the cleaning plan
- If user accepts: POST to `/excel-to-sql/clean` with the CSV + plan, replace local CSV state with the result
- "Continue to Upload" uses the cleaned CSV if cleaning was accepted, otherwise the original converted CSV
- If user dismisses modal without accepting: no state change

### `AiReviewModal.tsx` (new component)

Full-screen overlay modal with three sections:

| Section | Content |
|---|---|
| **Header Merges** | Table: original multi-row headers → merged result (e.g. `Revenue / 2024` → `Revenue_2024`) |
| **Data Islands Removed** | List of row ranges flagged as artifacts with plain-English reason |
| **Other Fixes** | Column renames, additional row exclusions |

- **"Accept & Clean"** — triggers `/clean` POST, shows loading state, then "✓ Data cleaned" before auto-closing
- **"Skip"** — dismisses with no changes

### Routing

`AiReviewPage` is removed from the `CsvOptimizerPlusPage` navigation flow. The `/ai-review` route remains in the router for backward compatibility but is no longer linked from the upload flow.

---

## AI Analysis Extension

### Extended `AiAnalysisRequest`

New field added:

```typescript
rawFirstRows: string[][]  // first 20 rows exactly as parsed, before header normalisation
```

### Extended `AiAnalysisResult`

Two new fields added:

```typescript
header_merges: {
  source_rows: number[]    // row indices that form the compound header
  merged_headers: string[] // final column names after merging (underscore separator)
}[]

data_islands: {
  start_row: number
  end_row: number
  start_col: number
  end_col: number
  reason: string           // plain-English explanation
}[]
```

### Prompt Extensions

Two new analysis tasks injected into the existing `/ai-analyze` n8n webhook system prompt:

1. **Header merge detection** — Inspect the first 20 rows for multi-row compound headers. Identify merged labels spanning columns whose sub-headers are periods/categories. Produce merged names using `_` as separator (e.g. `Revenue_2024`, `Revenue_2025`).

2. **Data island detection** — Identify rectangular regions spatially disconnected from the main dataset body. Common patterns: totals tables, footnotes formatted as mini-tables, summary crosstabs embedded below main data. Return bounding box coordinates and a reason for each island.

The LLM models used are the existing configured providers (Grok, DeepSeek, GPT OSS), prompted using analysis strategies consistent with how Claude, ChatGPT, and Gemini approach structured data interpretation.

---

## Python Cleaning Endpoint

### `POST /clean` (new endpoint in `main.py`)

- **Input:** multipart form — CSV file + `cleaning_plan` JSON field
- **Output:** cleaned CSV file + `changes_applied` summary JSON

```json
{
  "headers_merged": 3,
  "islands_removed": 1,
  "rows_dropped": 4,
  "columns_renamed": 2
}
```

### `scripts/clean.py` (new script)

Four deterministic Pandas operations applied in order:

1. **Header merge** — combines `source_rows` into a single header row using `_` separator, drops those rows from the data body
2. **Data island removal** — drops rows/columns within each `data_islands` bounding box, re-indexes the DataFrame
3. **Row exclusion** — drops rows listed in `rows_to_exclude` by index
4. **Column rename** — applies `column_renames` map (`{ original_name: new_name }`)

**Error handling:** out-of-bounds row/column references are skipped and flagged in `changes_applied` rather than failing the request.

---

## Data Contracts

### Cleaning Plan JSON (LLM output → Python input)

```json
{
  "header_merges": [
    {
      "source_rows": [0, 1],
      "merged_headers": ["Revenue_2024", "Revenue_2025", "Revenue_2026"]
    }
  ],
  "data_islands": [
    {
      "start_row": 45,
      "end_row": 52,
      "start_col": 0,
      "end_col": 3,
      "reason": "Summary totals table unrelated to main dataset body"
    }
  ],
  "rows_to_exclude": [0, 1, 55],
  "column_renames": {
    "Unnamed: 0": "Region",
    "Col_3": "Q1_Revenue"
  }
}
```

---

## Files Changed

| File | Change |
|---|---|
| `src/pages/CsvOptimizerPlusPage.tsx` | Add AI Review button, loading state, modal trigger, cleaned CSV state |
| `src/components/AiReviewModal.tsx` | New modal component |
| `src/types/index.ts` | Extend `AiAnalysisRequest` and `AiAnalysisResult` types |
| `excel-to-sql-api/main.py` | Add `POST /clean` endpoint |
| `excel-to-sql-api/scripts/clean.py` | New deterministic Pandas cleaning script |
| n8n `/ai-analyze` workflow | Extend prompt with header merge + data island detection instructions |

---

## What Is Not Changing

- The existing `/convert` endpoint and `convert.py` — untouched
- The existing upload flow (`UploadDatasetPage`) — untouched
- LLM provider configuration — existing providers used as-is
- Auth, session management, routing structure — untouched
