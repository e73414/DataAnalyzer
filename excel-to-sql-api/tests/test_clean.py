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


def test_negative_indices_are_skipped():
    """Negative indices in rows_to_exclude and data_islands should be silently skipped."""
    csv = "A,B\n1,2\n3,4\n5,6"
    plan = {
        "header_merges": [],
        "data_islands": [{"start_row": -5, "end_row": -1, "start_col": 0, "end_col": 1, "reason": "negative"}],
        "rows_to_exclude": [-1],
        "column_renames": {},
    }
    result_csv, changes = apply_cleaning_plan(csv, plan)
    lines = [ln for ln in result_csv.strip().split("\n") if ln]
    assert len(lines) == 4  # header + 3 rows unchanged
    assert changes["islands_removed"] == 0
    assert changes["rows_dropped"] == 0


# ── Endpoint tests ─────────────────────────────────────────────────────────

import json
from fastapi.testclient import TestClient
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


def test_clean_endpoint_returns_422_on_cleaning_failure():
    """Passing a file with no CSV content (empty bytes) should trigger a 422."""
    csv_content = b""  # empty CSV — pandas will raise on read
    plan = {"header_merges": [], "data_islands": [], "rows_to_exclude": [], "column_renames": {}}
    response = client.post(
        "/clean",
        files={"file": ("empty.csv", csv_content, "text/csv")},
        data={"cleaning_plan": json.dumps(plan)},
    )
    assert response.status_code == 422
    assert "Cleaning failed" in response.json()["detail"]
