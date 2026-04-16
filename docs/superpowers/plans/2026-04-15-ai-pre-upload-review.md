# AI Pre-Upload Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "AI Review" button to CSV Optimizer Plus that analyzes the converted data with an LLM, produces a cleaning plan (merged headers, data islands, row/column fixes), and applies it via a new Python cleaning endpoint before the user uploads to a dataset.

**Architecture:** The LLM (existing n8n `/ai-analyze` webhook, extended) receives the first 20 raw rows and returns a structured `CleaningPlan` JSON. A new `POST /excel-to-sql/clean` FastAPI endpoint accepts the CSV + plan and applies four deterministic Pandas operations. A new `AiReviewModal` component renders the plan, triggers cleaning, and feeds the cleaned CSV back into the existing upload flow. The old standalone `AiReviewPage` navigation is removed from the CSV Optimizer Plus flow.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS, Axios, FastAPI + Pandas, pytest, n8n MCP tools

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/types/index.ts` | Modify | Add `rawFirstRows` to `AiAnalysisRequest`; add `header_merges` + `data_islands` to `AiAnalysisResult` |
| `excel-to-sql-api/requirements.txt` | Modify | Add `pytest` and `httpx` for testing |
| `excel-to-sql-api/tests/__init__.py` | Create | Empty — marks tests as a package |
| `excel-to-sql-api/scripts/clean.py` | Create | `apply_cleaning_plan(csv_text, plan) → (csv, changes)` |
| `excel-to-sql-api/tests/test_clean.py` | Create | pytest tests for `clean.py` and the `/clean` endpoint |
| `excel-to-sql-api/main.py` | Modify | Add `POST /clean` endpoint |
| `src/components/AiReviewModal.tsx` | Create | Full-screen modal: renders cleaning plan, triggers `/clean`, calls `onCleanComplete` |
| `src/pages/CsvOptimizerPlusPage.tsx` | Modify | Add AI Review button + state; update `handleUploadAsDataset`; remove `skipAiReview`; add modal |
| n8n AI analyze workflow | Update via MCP | Extend LLM prompt with header_merges + data_islands instructions |

---

## Task 1: Extend TypeScript Types

**Files:**
- Modify: `src/types/index.ts:477-488` (the `AiAnalysisRequest` and `AiAnalysisResult` interfaces)

- [ ] **Step 1: Add `rawFirstRows` to `AiAnalysisRequest`**

In `src/types/index.ts`, find the `AiAnalysisRequest` interface (currently ends at line 488) and add one field:

```typescript
export interface AiAnalysisRequest {
  fileName: string
  headers: string[]
  firstRows: string[][]
  lastRows: string[][]
  dataBlocks: AiDataBlock[]
  rowCount: number
  columnCount: number
  profile?: Record<string, unknown>
  existingIssues?: string[]
  userInstructions?: string
  rawFirstRows?: string[][]  // first 20 rows before header normalisation
}
```

- [ ] **Step 2: Add `header_merges` and `data_islands` to `AiAnalysisResult`**

Find the `AiAnalysisResult` interface (currently at lines 469-475) and add two optional fields:

```typescript
export interface AiAnalysisResult {
  issues: AiIssue[]
  column_suggestions: AiColumnSuggestion[]
  rows_to_exclude: number[]
  blocks_to_exclude: number[]
  summary: string
  header_merges?: {
    source_rows: number[]    // row indices (in rawFirstRows) that form the compound header
    merged_headers: string[] // final column names after merging, underscore separator
  }[]
  data_islands?: {
    start_row: number  // 0-based row index in data (excluding header)
    end_row: number
    start_col: number
    end_col: number
    reason: string
  }[]
}
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

Run: `cd /Users/T872463/ai-stack/DataAnalyzer && npx tsc --noEmit`

Expected: no errors (or the same pre-existing errors as before — the new optional fields should not introduce new ones)

- [ ] **Step 4: Commit**

```bash
cd /Users/T872463/ai-stack/DataAnalyzer
git add src/types/index.ts
git commit -m "feat: extend AiAnalysisRequest/Result types for header merges and data islands"
```

---

## Task 2: Python Test Infrastructure

**Files:**
- Modify: `excel-to-sql-api/requirements.txt`
- Create: `excel-to-sql-api/tests/__init__.py`

- [ ] **Step 1: Add pytest and httpx to requirements**

Edit `excel-to-sql-api/requirements.txt` to add two lines at the end:

```
pytest==8.2.0
httpx==0.27.0
```

(`httpx` is needed by FastAPI's `TestClient` for the endpoint tests.)

- [ ] **Step 2: Create the tests package**

Create an empty file at `excel-to-sql-api/tests/__init__.py` with no content.

- [ ] **Step 3: Install the new dependencies**

```bash
cd /Users/T872463/ai-stack/DataAnalyzer/excel-to-sql-api
pip install pytest==8.2.0 httpx==0.27.0
```

Expected: `Successfully installed pytest-8.2.0 httpx-0.27.0` (or "already satisfied" if already installed)

- [ ] **Step 4: Commit**

```bash
cd /Users/T872463/ai-stack/DataAnalyzer
git add excel-to-sql-api/requirements.txt excel-to-sql-api/tests/__init__.py
git commit -m "chore: add pytest and httpx to excel-to-sql-api test dependencies"
```

---

## Task 3: Python Cleaning Script (TDD)

**Files:**
- Create: `excel-to-sql-api/tests/test_clean.py`
- Create: `excel-to-sql-api/scripts/clean.py`

- [ ] **Step 1: Write the failing tests**

Create `excel-to-sql-api/tests/test_clean.py`:

```python
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from scripts.clean import apply_cleaning_plan


def test_header_merge_renames_columns():
    csv = "Col_A,Col_B,Col_C\n1,2,3\n4,5,6"
    plan = {
        "header_merges": [{"source_rows": [0, 1], "merged_headers": ["Region", "Revenue_2024", "Revenue_2025"]}],
        "data_islands": [],
        "rows_to_exclude": [],
        "column_renames": {},
    }
    result_csv, changes = apply_cleaning_plan(csv, plan)
    assert "Region,Revenue_2024,Revenue_2025" in result_csv
    assert changes["headers_merged"] == 3


def test_data_island_removal():
    rows = "\n".join(f"row{i},val{i}" for i in range(10))
    csv = f"Name,Value\n{rows}"
    plan = {
        "header_merges": [],
        "data_islands": [{"start_row": 7, "end_row": 9, "start_col": 0, "end_col": 1, "reason": "summary"}],
        "rows_to_exclude": [],
        "column_renames": {},
    }
    result_csv, changes = apply_cleaning_plan(csv, plan)
    lines = [ln for ln in result_csv.strip().split("\n") if ln]
    # 10 data rows − 3 island rows (7,8,9) = 7 + 1 header = 8 lines
    assert len(lines) == 8
    assert changes["islands_removed"] == 3


def test_row_exclusion():
    csv = "A,B\n1,2\n3,4\n5,6\n7,8"
    plan = {
        "header_merges": [],
        "data_islands": [],
        "rows_to_exclude": [0, 2],
        "column_renames": {},
    }
    result_csv, changes = apply_cleaning_plan(csv, plan)
    lines = [ln for ln in result_csv.strip().split("\n") if ln]
    assert len(lines) == 3  # header + 2 remaining rows
    assert changes["rows_dropped"] == 2


def test_column_rename():
    csv = "old_name,B\n1,2"
    plan = {
        "header_merges": [],
        "data_islands": [],
        "rows_to_exclude": [],
        "column_renames": {"old_name": "new_name"},
    }
    result_csv, changes = apply_cleaning_plan(csv, plan)
    assert "new_name" in result_csv
    assert "old_name" not in result_csv
    assert changes["columns_renamed"] == 1


def test_out_of_bounds_rows_are_skipped():
    csv = "A,B\n1,2"
    plan = {
        "header_merges": [],
        "data_islands": [{"start_row": 100, "end_row": 200, "start_col": 0, "end_col": 1, "reason": "oob"}],
        "rows_to_exclude": [99],
        "column_renames": {},
    }
    result_csv, changes = apply_cleaning_plan(csv, plan)
    assert changes["islands_removed"] == 0
    assert changes["rows_dropped"] == 0
    lines = [ln for ln in result_csv.strip().split("\n") if ln]
    assert len(lines) == 2  # header + 1 data row — unchanged


def test_empty_plan_returns_unchanged_data():
    csv = "A,B\n1,2\n3,4"
    plan = {"header_merges": [], "data_islands": [], "rows_to_exclude": [], "column_renames": {}}
    result_csv, changes = apply_cleaning_plan(csv, plan)
    lines = [ln for ln in result_csv.strip().split("\n") if ln]
    assert len(lines) == 3
    assert all(v == 0 for v in changes.values())


def test_operations_applied_in_order():
    """Island removal runs before row exclusion; indices in rows_to_exclude
    are relative to the DataFrame AFTER island removal."""
    csv = "A,B\n" + "\n".join(f"{i},{i*2}" for i in range(8))
    # Remove rows 5-7 as island (3 rows), then exclude row 0 from what remains
    plan = {
        "header_merges": [],
        "data_islands": [{"start_row": 5, "end_row": 7, "start_col": 0, "end_col": 1, "reason": "island"}],
        "rows_to_exclude": [0],
        "column_renames": {},
    }
    result_csv, changes = apply_cleaning_plan(csv, plan)
    lines = [ln for ln in result_csv.strip().split("\n") if ln]
    # 8 rows - 3 island (5,6,7) = 5; then - 1 (row 0) = 4; + 1 header = 5
    assert len(lines) == 5
    assert changes["islands_removed"] == 3
    assert changes["rows_dropped"] == 1
```

- [ ] **Step 2: Run the tests — confirm they all fail**

```bash
cd /Users/T872463/ai-stack/DataAnalyzer/excel-to-sql-api
python -m pytest tests/test_clean.py -v
```

Expected: `ImportError: cannot import name 'apply_cleaning_plan' from 'scripts.clean'` (file doesn't exist yet)

- [ ] **Step 3: Implement `scripts/clean.py`**

Create `excel-to-sql-api/scripts/clean.py`:

```python
"""
Deterministic CSV cleaning module.

Applies an AI-generated cleaning plan to a CSV string using Pandas.
Operations are applied in this order:
  1. header_merges  — rename columns to AI-determined compound names
  2. data_islands   — drop rows within bounding boxes of disconnected data blocks
  3. rows_to_exclude — drop specific rows by 0-based index
  4. column_renames  — apply a rename map to remaining columns

Out-of-bounds row/column references are silently skipped and noted in
the returned changes dict without raising exceptions.
"""

from __future__ import annotations

import io
from typing import Any

import pandas as pd


def apply_cleaning_plan(
    csv_text: str,
    plan: dict[str, Any],
) -> tuple[str, dict[str, int]]:
    """
    Apply a cleaning plan to a CSV string.

    Args:
        csv_text: Raw CSV content (UTF-8 or UTF-8-BOM). First row is the header.
        plan: Dict with optional keys:
            header_merges: list of {source_rows, merged_headers}
            data_islands:  list of {start_row, end_row, start_col, end_col, reason}
            rows_to_exclude: list of int (0-based, relative to data after prior ops)
            column_renames: dict of {old_name: new_name}

    Returns:
        (cleaned_csv_text, changes_applied) where changes_applied counts
        headers_merged, islands_removed, rows_dropped, columns_renamed.
    """
    df = pd.read_csv(io.StringIO(csv_text), dtype=str)
    changes: dict[str, int] = {
        "headers_merged": 0,
        "islands_removed": 0,
        "rows_dropped": 0,
        "columns_renamed": 0,
    }

    # ── 1. Header merge ───────────────────────────────────────────────────────
    for merge in plan.get("header_merges", []):
        merged_headers: list[str] = merge.get("merged_headers", [])
        if not merged_headers:
            continue
        n = min(len(merged_headers), len(df.columns))
        rename_map = {old: new for old, new in zip(list(df.columns)[:n], merged_headers[:n])}
        df = df.rename(columns=rename_map)
        changes["headers_merged"] += n

    # ── 2. Data island removal ────────────────────────────────────────────────
    island_rows: set[int] = set()
    for island in plan.get("data_islands", []):
        start = island.get("start_row", 0)
        end = island.get("end_row", 0)
        island_rows.update(i for i in range(start, end + 1) if i < len(df))

    if island_rows:
        df = df.drop(index=list(island_rows)).reset_index(drop=True)
        changes["islands_removed"] += len(island_rows)

    # ── 3. Row exclusion ──────────────────────────────────────────────────────
    extra_rows: set[int] = set()
    for idx in plan.get("rows_to_exclude", []):
        if isinstance(idx, int) and idx < len(df):
            extra_rows.add(idx)

    if extra_rows:
        df = df.drop(index=list(extra_rows)).reset_index(drop=True)
        changes["rows_dropped"] += len(extra_rows)

    # ── 4. Column rename ──────────────────────────────────────────────────────
    col_renames: dict[str, str] = plan.get("column_renames", {})
    valid = {k: v for k, v in col_renames.items() if k in df.columns}
    if valid:
        df = df.rename(columns=valid)
        changes["columns_renamed"] += len(valid)

    return df.to_csv(index=False), changes
```

- [ ] **Step 4: Run the tests — confirm they all pass**

```bash
cd /Users/T872463/ai-stack/DataAnalyzer/excel-to-sql-api
python -m pytest tests/test_clean.py -v
```

Expected output:
```
tests/test_clean.py::test_header_merge_renames_columns PASSED
tests/test_clean.py::test_data_island_removal PASSED
tests/test_clean.py::test_row_exclusion PASSED
tests/test_clean.py::test_column_rename PASSED
tests/test_clean.py::test_out_of_bounds_rows_are_skipped PASSED
tests/test_clean.py::test_empty_plan_returns_unchanged_data PASSED
tests/test_clean.py::test_operations_applied_in_order PASSED

7 passed in 0.XXs
```

- [ ] **Step 5: Commit**

```bash
cd /Users/T872463/ai-stack/DataAnalyzer
git add excel-to-sql-api/scripts/clean.py excel-to-sql-api/tests/test_clean.py
git commit -m "feat: add deterministic CSV cleaning script with pytest coverage"
```

---

## Task 4: Add `/clean` Endpoint to FastAPI

**Files:**
- Modify: `excel-to-sql-api/main.py`
- Modify: `excel-to-sql-api/tests/test_clean.py` (append endpoint tests)

- [ ] **Step 1: Write the failing endpoint test — append to `test_clean.py`**

Append the following to the end of `excel-to-sql-api/tests/test_clean.py`:

```python
# ── Endpoint tests ─────────────────────────────────────────────────────────

import json
from fastapi.testclient import TestClient

# Import the FastAPI app from one directory up
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from main import app

client = TestClient(app)


def test_clean_endpoint_applies_column_rename():
    csv_content = b"old_col,B\n1,2\n3,4"
    plan = {"header_merges": [], "data_islands": [], "rows_to_exclude": [], "column_renames": {"old_col": "new_col"}}
    response = client.post(
        "/clean",
        files={"file": ("test.csv", csv_content, "text/csv")},
        data={"cleaning_plan": json.dumps(plan)},
    )
    assert response.status_code == 200
    body = response.json()
    assert "new_col" in body["cleaned_csv"]
    assert body["changes_applied"]["columns_renamed"] == 1


def test_clean_endpoint_rejects_invalid_json():
    csv_content = b"A,B\n1,2"
    response = client.post(
        "/clean",
        files={"file": ("test.csv", csv_content, "text/csv")},
        data={"cleaning_plan": "not-valid-json"},
    )
    assert response.status_code == 400
    assert "Invalid cleaning plan JSON" in response.json()["detail"]


def test_clean_endpoint_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
```

- [ ] **Step 2: Run the new endpoint tests — confirm they fail**

```bash
cd /Users/T872463/ai-stack/DataAnalyzer/excel-to-sql-api
python -m pytest tests/test_clean.py::test_clean_endpoint_applies_column_rename -v
```

Expected: `FAILED` — `AttributeError` or `404` because the `/clean` endpoint doesn't exist yet.

- [ ] **Step 3: Add the `/clean` endpoint to `main.py`**

At the top of `excel-to-sql-api/main.py`, add `Form` to the FastAPI import and add `import json`:

```python
import json
from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Form
```

Add `CleanResponse` model and the lazy-loader for the clean module just before the `ChartRequest` class (around line 119):

```python
# ── Clean response model ──────────────────────────────────────────────────────

class CleanResponse(BaseModel):
    cleaned_csv: str
    changes_applied: dict


_CLEAN_MODULE = None


def _get_clean():
    global _CLEAN_MODULE
    if _CLEAN_MODULE is None:
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "clean", Path(__file__).parent / "scripts" / "clean.py"
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _CLEAN_MODULE = mod
    return _CLEAN_MODULE


# ── Cleaning endpoint ─────────────────────────────────────────────────────────

@app.post(
    "/clean",
    summary="Apply AI cleaning plan to a converted CSV",
    response_model=CleanResponse,
)
async def clean(
    file: UploadFile = File(..., description="Converted CSV file from /convert"),
    cleaning_plan: str = Form(..., description="JSON cleaning plan from AI analysis"),
):
    content = await file.read()
    try:
        csv_text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        csv_text = content.decode("latin-1")

    try:
        plan = json.loads(cleaning_plan)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid cleaning plan JSON: {exc}")

    try:
        mod = _get_clean()
        cleaned_csv, changes = mod.apply_cleaning_plan(csv_text, plan)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Cleaning failed: {exc}")

    return CleanResponse(cleaned_csv=cleaned_csv, changes_applied=changes)
```

- [ ] **Step 4: Run all tests — confirm they all pass**

```bash
cd /Users/T872463/ai-stack/DataAnalyzer/excel-to-sql-api
python -m pytest tests/test_clean.py -v
```

Expected: all 10 tests pass (7 unit + 3 endpoint)

- [ ] **Step 5: Manually verify the running server exposes `/clean`**

```bash
cd /Users/T872463/ai-stack/DataAnalyzer/excel-to-sql-api
uvicorn main:app --port 8000 &
curl -s http://localhost:8000/openapi.json | python -m json.tool | grep '"\/clean"'
```

Expected: `"/clean": {` in the output

```bash
# Shut down the test server
kill %1
```

- [ ] **Step 6: Commit**

```bash
cd /Users/T872463/ai-stack/DataAnalyzer
git add excel-to-sql-api/main.py excel-to-sql-api/tests/test_clean.py
git commit -m "feat: add POST /clean endpoint to FastAPI for AI-driven CSV cleaning"
```

---

## Task 5: Create `AiReviewModal` Component

**Files:**
- Create: `src/components/AiReviewModal.tsx`

- [ ] **Step 1: Create the component file**

Create `src/components/AiReviewModal.tsx`:

```tsx
import { useState } from 'react'
import axios from 'axios'
import type { AiAnalysisResult } from '../types'

interface CleanResponse {
  cleaned_csv: string
  changes_applied: {
    headers_merged: number
    islands_removed: number
    rows_dropped: number
    columns_renamed: number
  }
}

interface AiReviewModalProps {
  isOpen: boolean
  onClose: () => void
  cleaningPlan: AiAnalysisResult
  csvText: string
  fileName: string
  onCleanComplete: (cleanedCsvText: string, changes: CleanResponse['changes_applied']) => void
}

export default function AiReviewModal({
  isOpen,
  onClose,
  cleaningPlan,
  csvText,
  fileName,
  onCleanComplete,
}: AiReviewModalProps) {
  const [isCleaning, setIsCleaning] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [changes, setChanges] = useState<CleanResponse['changes_applied'] | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const hasAnythingToClean =
    (cleaningPlan.header_merges?.length ?? 0) > 0 ||
    (cleaningPlan.data_islands?.length ?? 0) > 0 ||
    (cleaningPlan.rows_to_exclude?.length ?? 0) > 0 ||
    (cleaningPlan.column_suggestions?.some(s => s.suggested_name && s.suggested_name !== s.original) ?? false)

  const buildCleaningPlanPayload = () => ({
    header_merges: cleaningPlan.header_merges ?? [],
    data_islands: cleaningPlan.data_islands ?? [],
    rows_to_exclude: cleaningPlan.rows_to_exclude ?? [],
    column_renames: Object.fromEntries(
      (cleaningPlan.column_suggestions ?? [])
        .filter(s => s.suggested_name && s.suggested_name !== s.original)
        .map(s => [s.original, s.suggested_name!])
    ),
  })

  const handleAcceptAndClean = async () => {
    setIsCleaning(true)
    setError(null)
    try {
      const formData = new FormData()
      const blob = new Blob([csvText], { type: 'text/csv' })
      formData.append('file', blob, fileName)
      formData.append('cleaning_plan', JSON.stringify(buildCleaningPlanPayload()))
      const response = await axios.post<CleanResponse>('/excel-to-sql/clean', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      })
      const { cleaned_csv, changes_applied } = response.data
      setChanges(changes_applied)
      setIsDone(true)
      onCleanComplete(cleaned_csv, changes_applied)
      setTimeout(() => {
        setIsDone(false)
        setChanges(null)
        onClose()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsCleaning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">

        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">AI Data Review</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Reviewing <span className="font-medium">{fileName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">

          {/* Summary */}
          {cleaningPlan.summary && (
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
              <p className="text-sm text-purple-800 dark:text-purple-300">{cleaningPlan.summary}</p>
            </div>
          )}

          {/* Header Merges */}
          {(cleaningPlan.header_merges?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Header Merges</h3>
              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50">
                      <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Source Rows</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Merged Headers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {cleaningPlan.header_merges!.map((m, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          rows {m.source_rows.join(', ')}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-800 dark:text-gray-200">
                          {m.merged_headers.join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Data Islands */}
          {(cleaningPlan.data_islands?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Data Islands to Remove</h3>
              <div className="space-y-2">
                {cleaningPlan.data_islands!.map((island, i) => (
                  <div key={i} className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <div className="text-xs font-medium text-red-700 dark:text-red-400">
                      Rows {island.start_row}–{island.end_row}, Cols {island.start_col}–{island.end_col}
                    </div>
                    <div className="text-xs text-red-600 dark:text-red-300 mt-0.5">{island.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Column Renames (from column_suggestions) */}
          {(cleaningPlan.column_suggestions?.filter(s => s.suggested_name && s.suggested_name !== s.original).length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Column Renames</h3>
              <div className="space-y-1.5">
                {cleaningPlan.column_suggestions!
                  .filter(s => s.suggested_name && s.suggested_name !== s.original)
                  .map((s, i) => (
                    <div key={i} className="text-sm border-l-2 border-blue-400 dark:border-blue-600 pl-3">
                      <span className="font-mono text-gray-600 dark:text-gray-400">{s.original}</span>
                      <span className="text-gray-400 dark:text-gray-500"> → </span>
                      <span className="font-mono font-medium text-gray-900 dark:text-white">{s.suggested_name}</span>
                      {s.reason && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.reason}</p>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Row exclusions */}
          {(cleaningPlan.rows_to_exclude?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Rows to Drop</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {cleaningPlan.rows_to_exclude!.length} row
                {cleaningPlan.rows_to_exclude!.length !== 1 ? 's' : ''} flagged:{' '}
                rows {cleaningPlan.rows_to_exclude!.slice(0, 10).join(', ')}
                {cleaningPlan.rows_to_exclude!.length > 10 ? '…' : ''}
              </p>
            </div>
          )}

          {/* Nothing to clean */}
          {!hasAnythingToClean && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                No cleaning needed. Your data looks clean.
              </p>
            </div>
          )}

          {/* Success state */}
          {isDone && changes && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">✓ Data cleaned successfully</p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                {changes.headers_merged} headers merged · {changes.islands_removed} island rows removed ·{' '}
                {changes.rows_dropped} rows dropped · {changes.columns_renamed} columns renamed
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button onClick={onClose} disabled={isCleaning} className="btn-secondary">
            Skip
          </button>
          {hasAnythingToClean && !isDone && (
            <button onClick={handleAcceptAndClean} disabled={isCleaning} className="btn-primary">
              {isCleaning ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Cleaning…
                </span>
              ) : (
                'Accept & Clean'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles the new component**

```bash
cd /Users/T872463/ai-stack/DataAnalyzer
npx tsc --noEmit
```

Expected: no new errors

- [ ] **Step 3: Commit**

```bash
cd /Users/T872463/ai-stack/DataAnalyzer
git add src/components/AiReviewModal.tsx
git commit -m "feat: add AiReviewModal component for in-page AI data cleaning"
```

---

## Task 6: Modify `CsvOptimizerPlusPage.tsx`

**Files:**
- Modify: `src/pages/CsvOptimizerPlusPage.tsx`

This task has 5 sub-steps. Make all changes in sequence, then verify and commit once at the end.

- [ ] **Step 1: Add imports**

At the top of `CsvOptimizerPlusPage.tsx`, the existing imports end around line 12. Add three new import lines after the existing imports:

```typescript
import { n8nService } from '../services/mcpN8nService'
import AiReviewModal from '../components/AiReviewModal'
import type { AiAnalysisResult, AiDataBlock } from '../types'
```

- [ ] **Step 2: Add `detectDataBlocks` helper function**

After the `formatFileSize` function (around line 120) and before `ChevronIcon`, add:

```typescript
function detectDataBlocks(rows: string[][]): AiDataBlock[] {
  const isEmpty = (row: string[]) => row.every(cell => !cell || !cell.trim())
  const blocks: AiDataBlock[] = []
  let blockStart = -1
  for (let i = 0; i <= rows.length; i++) {
    const empty = i === rows.length || isEmpty(rows[i])
    if (!empty && blockStart === -1) {
      blockStart = i
    } else if (empty && blockStart !== -1) {
      const blockRows = rows.slice(blockStart, i)
      blocks.push({
        startRow: blockStart + 1,
        endRow: i,
        rowCount: blockRows.length,
        sampleRows: blockRows.slice(0, 5),
      })
      blockStart = -1
    }
  }
  return blocks
}
```

- [ ] **Step 3: Add new state variables and remove `skipAiReview`**

In the component body, find the `skipAiReview` state declaration (line 188):
```typescript
const [skipAiReview, setSkipAiReview] = useState<Record<string, boolean>>({})
```

Replace it with the new state variables:

```typescript
// AI Review state
const [isAnalyzing, setIsAnalyzing] = useState<Record<string, boolean>>({})
const [aiReviewOpen, setAiReviewOpen] = useState(false)
const [aiReviewConv, setAiReviewConv] = useState<SheetConversion | null>(null)
const [aiReviewPlan, setAiReviewPlan] = useState<AiAnalysisResult | null>(null)
const [aiReviewCsvText, setAiReviewCsvText] = useState('')
const [aiReviewFileName, setAiReviewFileName] = useState('')
const [cleanedCsvs, setCleanedCsvs] = useState<Record<string, string>>({})
```

- [ ] **Step 4: Add `handleAiReview` function and replace `handleUploadAsDataset`**

Add the `handleAiReview` function immediately before `handleUploadAsDataset` (around line 539):

```typescript
const handleAiReview = async (conv: SheetConversion) => {
  const csv = getActiveCleanCsv(conv)
  if (!csv) return

  const { headers, rows } = parseCSV(csv)
  const rawFirstRows = [headers, ...rows].slice(0, 20)
  const sheetSuffix = sheetConversions.length > 1 ? ` - ${conv.sheet}` : ''
  const displayName = `${sourceName}${sheetSuffix}`

  setIsAnalyzing(prev => ({ ...prev, [conv.sheet]: true }))
  try {
    const plan = await n8nService.analyzeDataQuality({
      fileName: displayName,
      headers,
      firstRows: rows.slice(0, 20),
      lastRows: rows.slice(-10),
      dataBlocks: detectDataBlocks(rows).length > 1 ? detectDataBlocks(rows) : [],
      rowCount: conv.result.profileJson?.row_count ?? rows.length,
      columnCount: conv.result.profileJson?.column_count ?? headers.length,
      profile: conv.result.profileJson as Record<string, unknown>,
      existingIssues: conv.aggregateRows.map(r => r.reason),
      rawFirstRows,
    })
    setAiReviewPlan(plan)
    setAiReviewConv(conv)
    setAiReviewCsvText(csv)
    setAiReviewFileName(`${displayName}_clean.csv`)
    setAiReviewOpen(true)
  } catch (err) {
    toast.error(`AI Review failed: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    setIsAnalyzing(prev => ({ ...prev, [conv.sheet]: false }))
  }
}
```

Replace the entire existing `handleUploadAsDataset` function (lines 539–592) with:

```typescript
const handleUploadAsDataset = (conv: SheetConversion) => {
  // Use AI-cleaned CSV if available, otherwise fall back to the active clean CSV
  const csvSource = cleanedCsvs[conv.sheet] ?? getActiveCleanCsv(conv)
  if (!csvSource) return

  const { headers } = parseCSV(conv.result.cleanCsv)
  const excludedColNames = headers.filter((_, i) => conv.excludedCols.has(i))
  const ingestionConfig = {
    source_type: isExcel ? 'excel' as const : 'csv' as const,
    config: {
      sheets: [{ name: conv.sheet, header_row: options.header_row || undefined, excluded_col_names: excludedColNames }],
      no_unpivot: options.no_unpivot,
      keep_dupes: options.keep_dupes,
    },
  }

  const sheetSuffix = sheetConversions.length > 1 ? ` - ${conv.sheet}` : ''
  const displayName = `${sourceName}${sheetSuffix}`
  const fileName = `${displayName}_clean.csv`
  const blob = new Blob([csvSource], { type: 'text/csv' })
  const file = new File([blob], fileName, { type: 'text/csv' })

  let sourceInfo: { location_type: string; folder_id: string; schedule: string | null } | undefined
  if (lastGsheetsId.current) {
    sourceInfo = { location_type: 'google_sheets', folder_id: lastGsheetsId.current, schedule: gsheetsSchedule || null }
  } else if (lastOnedriveUrl.current) {
    sourceInfo = { location_type: 'onedrive_file', folder_id: lastOnedriveUrl.current, schedule: onedriveSchedule || null }
  }

  navigate('/upload-dataset', { state: { csvFile: file, fileName: displayName, ingestionConfig, sourceInfo } })
}
```

- [ ] **Step 5: Update the JSX — buttons and modal**

**5a. Replace the button group and remove the `skipAiReview` checkbox.**

Find this block in the JSX (around line 1145–1158):
```tsx
<div className="flex flex-wrap gap-2">
  <button onClick={() => handleDownloadZip(conv)} className="btn-secondary text-sm">Download ZIP</button>
  <button onClick={() => handleDownloadCleanCsv(conv)} className="btn-secondary text-sm">Download CSV</button>
  <button onClick={() => handleUploadAsDataset(conv)} className="btn-primary text-sm">Upload as Dataset</button>
</div>
<label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
  <input
    type="checkbox"
    checked={!!skipAiReview[conv.sheet]}
    onChange={e => setSkipAiReview(prev => ({ ...prev, [conv.sheet]: e.target.checked }))}
    className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600"
  />
  <span className="text-xs text-gray-500 dark:text-gray-400">Skip AI review</span>
</label>
```

Replace it with:
```tsx
<div className="flex flex-wrap gap-2">
  <button onClick={() => handleDownloadZip(conv)} className="btn-secondary text-sm">Download ZIP</button>
  <button onClick={() => handleDownloadCleanCsv(conv)} className="btn-secondary text-sm">Download CSV</button>
  <button
    onClick={() => handleAiReview(conv)}
    disabled={!!isAnalyzing[conv.sheet]}
    className="btn-secondary text-sm border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 disabled:opacity-50"
  >
    {isAnalyzing[conv.sheet] ? (
      <span className="flex items-center gap-2">
        <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-purple-500 border-t-transparent" />
        Analyzing…
      </span>
    ) : cleanedCsvs[conv.sheet] ? (
      '✓ AI Reviewed'
    ) : (
      'AI Review'
    )}
  </button>
  <button onClick={() => handleUploadAsDataset(conv)} className="btn-primary text-sm">Upload as Dataset</button>
</div>
```

**5b. Add the `AiReviewModal` to the JSX.**

Find the closing `</div>` of the component (the very last `</div>` before `}` — line 1286), and insert the modal just before it:

```tsx
      {/* AI Review Modal */}
      {aiReviewOpen && aiReviewPlan && aiReviewConv && (
        <AiReviewModal
          isOpen={aiReviewOpen}
          onClose={() => setAiReviewOpen(false)}
          cleaningPlan={aiReviewPlan}
          csvText={aiReviewCsvText}
          fileName={aiReviewFileName}
          onCleanComplete={(cleanedCsv) => {
            setCleanedCsvs(prev => ({ ...prev, [aiReviewConv!.sheet]: cleanedCsv }))
          }}
        />
      )}
    </div>
  )
```

- [ ] **Step 6: Verify TypeScript compiles cleanly**

```bash
cd /Users/T872463/ai-stack/DataAnalyzer
npx tsc --noEmit
```

Expected: no new type errors. If `setSkipAiReview` still appears anywhere (grep to check), remove those references.

```bash
grep -n "skipAiReview\|setSkipAiReview" src/pages/CsvOptimizerPlusPage.tsx
```

Expected: no output (all references removed)

- [ ] **Step 7: Verify the dev server builds**

```bash
cd /Users/T872463/ai-stack/DataAnalyzer
npm run build 2>&1 | tail -20
```

Expected: `✓ built in Xs` with no errors

- [ ] **Step 8: Commit**

```bash
cd /Users/T872463/ai-stack/DataAnalyzer
git add src/pages/CsvOptimizerPlusPage.tsx
git commit -m "feat: add AI Review button to CSV Optimizer Plus with inline modal flow"
```

---

## Task 7: Update n8n AI Analyze Workflow Prompt

**Important:** Per project rules (CLAUDE.md), only modify n8n workflows tagged `AI-DEV`. Never commit workflow JSON files. Use n8n MCP tools.

- [ ] **Step 1: Find the AI analyze workflow**

Use the n8n MCP search to find the workflow that handles the `/ai-analyze` endpoint:

```
mcp__claude_ai_n8n__search_workflows with query "ai analyze data quality"
```

Note the workflow ID and name. Confirm it has the `AI-DEV` tag before proceeding. If it does not have the tag, **stop** and ask the user to tag it.

- [ ] **Step 2: Get the current workflow details**

```
mcp__claude_ai_n8n__get_workflow_details with workflowId = <id from step 1>
```

Identify the node that contains the LLM system prompt — typically an "AI Agent", "Chat Model", or "Set" node with a `systemMessage` or `prompt` parameter containing the existing data quality analysis instructions.

- [ ] **Step 3: Extend the system prompt**

The existing prompt likely asks the LLM to return JSON with `issues`, `column_suggestions`, `rows_to_exclude`, `blocks_to_exclude`, and `summary`. Extend it by appending the following two sections **inside the same JSON schema instructions**:

```
## Header Merge Detection

Inspect the `rawFirstRows` field (the first 20 rows as raw strings, before header normalisation).
Look for multi-row compound headers — where a label in row N spans multiple columns whose sub-labels
appear in row N+1 (or N+2). This pattern is common when Excel merged cells are exported.

Example:
  rawFirstRows[0] = ["", "Revenue", "", "", "Cost", ""]
  rawFirstRows[1] = ["Region", "2024", "2025", "2026", "2024", "2025"]
  Result: merged headers = ["Region", "Revenue_2024", "Revenue_2025", "Revenue_2026", "Cost_2024", "Cost_2025"]

For each group of rows that forms a compound header, include a `header_merges` entry in your JSON:
{
  "source_rows": [0, 1],
  "merged_headers": ["Region", "Revenue_2024", "Revenue_2025", "Revenue_2026", "Cost_2024", "Cost_2025"]
}

Return an empty `header_merges` array if headers are already in a single row.

## Data Island Detection

Inspect the `dataBlocks` field to identify rectangular regions that are spatially disconnected from the
main dataset body. Common artifacts: totals tables in a corner, footnote tables at the bottom, summary
crosstabs embedded below the main data, small reference tables off to the side.

Signals that a block is a data island (not part of the main dataset):
1. Significantly smaller than the primary data block
2. Contains aggregate/summary labels (Total, Average, Grand Total, etc.)
3. Has a different column count or structure than the primary data

For each island, include a `data_islands` entry:
{
  "start_row": 45,
  "end_row": 52,
  "start_col": 0,
  "end_col": 3,
  "reason": "Summary totals table unrelated to main dataset body"
}

Row and column indices are 0-based and refer to positions in the data (excluding the header row).
Return an empty `data_islands` array if no islands are found.
```

The final JSON schema returned by the LLM must now include:
```json
{
  "issues": [...],
  "column_suggestions": [...],
  "rows_to_exclude": [...],
  "blocks_to_exclude": [...],
  "summary": "...",
  "header_merges": [...],
  "data_islands": [...]
}
```

- [ ] **Step 4: Update the workflow**

```
mcp__claude_ai_n8n__update_workflow with the workflow ID and the modified node parameters
```

- [ ] **Step 5: Validate and publish**

```
mcp__claude_ai_n8n__validate_workflow
mcp__claude_ai_n8n__publish_workflow
```

- [ ] **Step 6: Smoke-test the endpoint**

Verify the FastAPI backend is running and trigger an AI Review through the UI with a sample Excel file that has multi-row headers. Confirm the modal opens and shows header_merges in the UI.

If the n8n workflow returns `header_merges: undefined` (the LLM didn't return new fields), check:
1. The prompt was saved correctly in n8n
2. The response parsing in `mcpN8nService.analyzeDataQuality` passes through unknown fields (it returns `response.data` directly, so new fields should flow through automatically)

---

## Self-Review

### Spec Coverage Check

| Spec requirement | Task(s) |
|---|---|
| "AI Review" button after CSV Optimizer Plus conversion | Task 6 — button in JSX |
| AI Review uses LLM strategies (Grok/DeepSeek/GPT OSS) | Task 7 — n8n workflow extended |
| First 20 rows for merged column header detection | Tasks 1+7 — `rawFirstRows` field + prompt |
| Merged headers resolved with `_` separator | Task 7 — prompt instructs `Revenue_2024` pattern |
| Data islands identified and discarded | Tasks 1+7 — `data_islands` type + prompt |
| Python script applies cleaning plan automatically | Tasks 3+4 — `clean.py` + `/clean` endpoint |
| Cleaned data feeds existing upload flow | Task 6 — `cleanedCsvs` state + `handleUploadAsDataset` |
| Modal shows plan (header merges, islands, renames) | Task 5 — `AiReviewModal` component |
| "Accept & Clean" fully automatic, "Skip" available | Task 5 — modal buttons |
| Old `AiReviewPage` removed from flow | Task 6 — `handleUploadAsDataset` no longer navigates to `/ai-review` |

All requirements covered. ✓

### Type Consistency Check

- `AiAnalysisResult.header_merges` defined in Task 1, used in `AiReviewModal.tsx` (Task 5) and `buildCleaningPlanPayload()` — consistent ✓
- `AiAnalysisResult.data_islands` defined in Task 1, used in `AiReviewModal.tsx` (Task 5) and cleaning plan JSON — consistent ✓
- `AiAnalysisRequest.rawFirstRows` defined in Task 1, populated in `handleAiReview` (Task 6) — consistent ✓
- `CleanResponse` defined inline in `AiReviewModal.tsx` (matches `CleanResponse` Pydantic model in `main.py`) — consistent ✓
- `apply_cleaning_plan` defined in Task 3, imported in `main.py` Task 4 via `_get_clean()` loader — consistent ✓
- `onCleanComplete` in `AiReviewModalProps` accepts `(cleanedCsvText: string, changes)`, called with both args in `AiReviewModal`, modal mount in Task 6 uses only `cleanedCsv` arg (second arg ignored) — consistent ✓
