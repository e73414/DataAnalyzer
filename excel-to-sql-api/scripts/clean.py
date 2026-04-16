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
        island_rows.update(i for i in range(start, end + 1) if 0 <= i < len(df))

    if island_rows:
        df = df.drop(index=list(island_rows)).reset_index(drop=True)
        changes["islands_removed"] += len(island_rows)

    # ── 3. Row exclusion ──────────────────────────────────────────────────────
    extra_rows: set[int] = set()
    for idx in plan.get("rows_to_exclude", []):
        if isinstance(idx, int) and 0 <= idx < len(df):
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
