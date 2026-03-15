#!/usr/bin/env python3
"""
Excel/CSV → SQL-ready CSV converter  (v2)

New in v2:
  - Automatic header row detection  (skips title/metadata rows above the table)
  - Wide-to-long unpivot            (date/period/quarter column headers → row values)
  - Multi-sheet Excel support       (--sheet all) with cross-sheet JOIN hints
  - Embedded unit normalization     (1.2K → 1200, 3.5M → 3500000, etc.)
  - Duplicate row detection/removal
  - Statistical outlier flagging    (IQR method)
  - DDL generation                  (<stem>_schema.sql  CREATE TABLE with hints)
  - Encoding auto-detection         (falls back gracefully for non-UTF-8 files)

Outputs per sheet:
  <stem>_clean.csv        — normalized, SQL-friendly CSV
  <stem>_profile.json     — column metadata for AI context generation
  <stem>_schema.sql       — CREATE TABLE DDL with type hints

Multi-sheet only:
  <stem>_relationships.json — cross-sheet JOIN suggestions

Usage:
  python convert.py <file> [options]

Options:
  --output-dir DIR    Output directory (default: same as input)
  --sheet SHEET       Sheet name, 0-based index, or "all"  (default: 0)
  --header-row N      Force header row index (0-based). Default: auto-detect
  --no-unpivot        Disable automatic wide-to-long transformation
  --keep-dupes        Keep duplicate rows (default: remove them)
"""

import sys
import json
import re
import argparse
from pathlib import Path
from datetime import datetime

try:
    import pandas as pd
    import numpy as np
except ImportError:
    print("Installing required packages...")
    import subprocess
    subprocess.check_call([
        sys.executable, "-m", "pip", "install",
        "pandas", "openpyxl", "xlrd", "chardet",
        "--break-system-packages", "-q"
    ])
    import pandas as pd
    import numpy as np


# ── Period/date patterns (for unpivot detection) ───────────────────────────

MONTH_ABBREVS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
MONTH_FULL    = ['january','february','march','april','may','june','july',
                 'august','september','october','november','december']
MONTH_TO_NUM  = {m: i+1 for i, m in enumerate(MONTH_ABBREVS)}
MONTH_TO_NUM.update({m: i+1 for i, m in enumerate(MONTH_FULL)})

# (regex_pattern, tag) — checked in order
PERIOD_PATTERNS = [
    (r'^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[- _]?(\d{2,4})$',          'month_abbrev_year'),
    (r'^(january|february|march|april|may|june|july|august|september|october|november|december)[- _]?(\d{2,4})$', 'month_full_year'),
    (r'^(\d{4})[-/](\d{1,2})$',                                                       'year_month_iso'),
    (r'^q([1-4])[- _]?(\d{2,4})$',                                                    'quarter_year'),
    (r'^(\d{2,4})[- _]?q([1-4])$',                                                    'year_quarter'),
    (r'^fy(\d{2,4})[- _]?q([1-4])$',                                                  'fy_quarter'),
    (r'^(20\d{2}|19\d{2})$',                                                           'year_only'),
]


def is_period_column(name: str) -> bool:
    n = str(name).strip().lower()
    for pattern, _ in PERIOD_PATTERNS:
        if re.match(pattern, n):
            return True
    return False


def period_to_date(name: str) -> str:
    """Convert a period label to YYYY-MM-DD (first day of the period)."""
    n = str(name).strip().lower()

    m = re.match(r'^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[- _]?(\d{2,4})$', n)
    if m:
        mon = MONTH_TO_NUM[m.group(1)]
        yr  = int(m.group(2)); yr = yr + 2000 if yr < 100 else yr
        return f"{yr:04d}-{mon:02d}-01"

    m = re.match(r'^(january|february|march|april|may|june|july|august|september|october|november|december)[- _]?(\d{2,4})$', n)
    if m:
        mon = MONTH_TO_NUM[m.group(1)]
        yr  = int(m.group(2)); yr = yr + 2000 if yr < 100 else yr
        return f"{yr:04d}-{mon:02d}-01"

    m = re.match(r'^(\d{4})[-/](\d{1,2})$', n)
    if m:
        return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-01"

    m = re.match(r'^q([1-4])[- _]?(\d{2,4})$', n)
    if m:
        q = int(m.group(1)); yr = int(m.group(2)); yr = yr + 2000 if yr < 100 else yr
        return f"{yr:04d}-{(q-1)*3+1:02d}-01"

    m = re.match(r'^(\d{2,4})[- _]?q([1-4])$', n)
    if m:
        yr = int(m.group(1)); yr = yr + 2000 if yr < 100 else yr; q = int(m.group(2))
        return f"{yr:04d}-{(q-1)*3+1:02d}-01"

    m = re.match(r'^fy(\d{2,4})[- _]?q([1-4])$', n)
    if m:
        yr = int(m.group(1)); yr = yr + 2000 if yr < 100 else yr; q = int(m.group(2))
        return f"{yr:04d}-{(q-1)*3+1:02d}-01"

    m = re.match(r'^(20\d{2}|19\d{2})$', n)
    if m:
        return f"{m.group(1)}-01-01"

    return str(name)  # fallback: leave unchanged


# ── Column name normalisation ──────────────────────────────────────────────

def to_snake_case(name: str) -> str:
    name = str(name).strip().strip('"\'')
    name = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1_\2', name)
    name = re.sub(r'([a-z\d])([A-Z])',      r'\1_\2', name)
    name = re.sub(r'[\s\-/\\\.]+',          '_',      name)
    name = re.sub(r'[^\w]',                 '_',      name)
    name = name.lower()
    name = re.sub(r'_+', '_', name).strip('_')
    if name and name[0].isdigit():
        name = 'col_' + name
    return name or 'column'


def deduplicate_columns(cols: list) -> list:
    seen: dict = {}
    result = []
    for col in cols:
        if col in seen:
            seen[col] += 1
            result.append(f"{col}_{seen[col]}")
        else:
            seen[col] = 0
            result.append(col)
    return result


# ── Encoding detection ─────────────────────────────────────────────────────

def detect_encoding(path: Path) -> str:
    try:
        import chardet
        with open(path, 'rb') as f:
            raw = f.read(50_000)
        return chardet.detect(raw).get('encoding') or 'utf-8'
    except ImportError:
        for enc in ('utf-8', 'utf-8-sig', 'latin-1', 'cp1252'):
            try:
                with open(path, encoding=enc) as f:
                    f.read(1024)
                return enc
            except UnicodeDecodeError:
                continue
        return 'latin-1'


# ── Header row detection ───────────────────────────────────────────────────

def detect_header_row(df_raw: pd.DataFrame, max_scan: int = 10) -> int:
    """
    Scan the first max_scan rows and return the index of the best header candidate.

    A good header row has:
    - Many non-null values  (coverage)
    - Mostly unique values  (uniqueness)
    - Mostly string / non-numeric values  (text-likeness)

    We return the row with the highest weighted score.
    """
    best_row, best_score = 0, -1
    scan_end = min(max_scan, len(df_raw))

    for i in range(scan_end):
        row    = df_raw.iloc[i]
        values = [str(v).strip() for v in row if pd.notna(v) and str(v).strip()]
        if not values:
            continue

        non_numeric = sum(
            1 for v in values
            if not re.match(r'^[£$€¥]?[\d,.\-]+[KkMmBb]?$', v)
        )
        uniqueness   = len(set(values)) / len(values)
        coverage     = len(values) / max(len(row), 1)
        text_ratio   = non_numeric / len(values)

        score = text_ratio * 0.5 + uniqueness * 0.3 + coverage * 0.2

        if score > best_score:
            best_score = score
            best_row   = i

    return best_row


# ── File loading ───────────────────────────────────────────────────────────

def load_file(path: Path, sheet=0, header_row: int = None,
              encoding: str = 'utf-8') -> tuple:
    """
    Load a file and return (df, detected_header_row, sheet_names).
    sheet_names is None for CSV.
    """
    ext         = path.suffix.lower()
    sheet_names = None

    if ext in ('.xlsx', '.xls', '.xlsm'):
        try:
            sheet_idx = int(sheet)
        except (ValueError, TypeError):
            sheet_idx = sheet

        sheet_names = pd.ExcelFile(path).sheet_names
        df_raw      = pd.read_excel(path, sheet_name=sheet_idx, header=None)

    elif ext == '.csv':
        df_raw = pd.read_csv(path, header=None, encoding=encoding,
                             low_memory=False, on_bad_lines='warn')
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    if header_row is None:
        header_row = detect_header_row(df_raw)

    if ext in ('.xlsx', '.xls', '.xlsm'):
        df = pd.read_excel(path, sheet_name=sheet_idx, header=header_row)
    else:
        df = pd.read_csv(path, header=header_row, encoding=encoding,
                         low_memory=False, on_bad_lines='warn')

    df = df.dropna(how='all').dropna(axis=1, how='all')
    return df, header_row, sheet_names


# ── Embedded unit normalization  (1.2M → 1200000) ─────────────────────────

UNIT_MULTIPLIERS = {
    'k': 1_000, 'mn': 1_000_000, 'm': 1_000_000,
    'bn': 1_000_000_000, 'b': 1_000_000_000,
    'tn': 1_000_000_000_000, 't': 1_000_000_000_000,
}
_UNIT_RE = re.compile(
    r'^[£$€¥]?\s*([\d,]+\.?\d*)\s*(tn|bn|mn|k|m|b|t)$',
    re.IGNORECASE
)

def _parse_unit(val: str):
    """Return (float_value, suffix) or (None, None)."""
    m = _UNIT_RE.match(str(val).strip().replace(',', ''))
    if m:
        return float(m.group(1)) * UNIT_MULTIPLIERS[m.group(2).lower()], m.group(2).lower()
    return None, None

def _is_unit_column(series: pd.Series) -> tuple:
    non_null = series.dropna().astype(str)
    if len(non_null) == 0:
        return False, None
    hits = [_parse_unit(v) for v in non_null]
    matches = [(v, s) for v, s in hits if v is not None]
    if len(matches) / len(non_null) >= 0.5:
        dominant = max({s for _, s in matches}, key=lambda s: UNIT_MULTIPLIERS.get(s, 0))
        return True, dominant
    return False, None


# ── Type inference ─────────────────────────────────────────────────────────

BOOL_MAP = {
    'true': True, 'false': False, 'yes': True, 'no': False,
    'y': True,    'n': False,     '1': True,   '0': False,
    't': True,    'f': False,
}

def infer_column_type(series: pd.Series) -> str:
    """Return one of: integer | float | date | boolean | string | empty."""
    non_null = series.dropna()
    if len(non_null) == 0:
        return 'empty'

    # Unit-encoded numerics
    is_unit, _ = _is_unit_column(non_null)
    if is_unit:
        return 'float'

    stripped = (non_null.astype(str).str.strip()
                .str.replace(r'[$,€£¥%]', '', regex=True)
                .str.replace(r'\s', '', regex=True))

    # Boolean (check before numeric — '0'/'1' overlap)
    if set(non_null.astype(str).str.lower().str.strip().unique()).issubset(BOOL_MAP):
        return 'boolean'

    # Numeric
    numeric = pd.to_numeric(stripped, errors='coerce')
    if numeric.notna().sum() / len(non_null) >= 0.85:
        return 'integer' if numeric.dropna().apply(lambda x: float(x) == int(x)).all() else 'float'

    # Date
    try:
        dates = pd.to_datetime(non_null, errors='coerce')
        if dates.notna().sum() / len(non_null) >= 0.85:
            return 'date'
    except Exception:
        pass

    return 'string'


# ── Wide-to-long unpivot ───────────────────────────────────────────────────

def detect_and_unpivot(df: pd.DataFrame) -> tuple:
    """
    If 3+ column headers look like date/period labels, melt the dataframe
    from wide to long format.

    Returns (df, unpivot_info_dict_or_None).
    """
    date_cols = [c for c in df.columns if is_period_column(str(c))]

    if len(date_cols) < 3:
        return df, None

    id_cols = [c for c in df.columns if c not in date_cols]

    df_long = df.melt(
        id_vars=id_cols,
        value_vars=date_cols,
        var_name='period',
        value_name='value',
    )
    df_long['period'] = df_long['period'].apply(period_to_date)
    df_long = df_long.sort_values(['period'] + list(id_cols)).reset_index(drop=True)

    info = {
        'applied': True,
        'date_columns_found':  [str(c) for c in date_cols],
        'date_columns_count':  len(date_cols),
        'id_columns':          [str(c) for c in id_cols],
        'rows_before':         len(df),
        'rows_after':          len(df_long),
        'note': (
            f"Auto-detected {len(date_cols)} date/period columns "
            f"({date_cols[0]} … {date_cols[-1]}). "
            f"Reshaped from wide ({len(df)} rows × {len(df.columns)} cols) "
            f"to long ({len(df_long)} rows × {len(df_long.columns)} cols). "
            f"Pass --no-unpivot to disable."
        ),
    }
    return df_long, info


# ── Data cleaning ──────────────────────────────────────────────────────────

def apply_cleaning(df: pd.DataFrame) -> pd.DataFrame:
    cleaned = df.copy()
    for col in cleaned.columns:
        series = cleaned[col]

        # Unit-encoded numerics → raw float
        is_unit, _ = _is_unit_column(series.dropna())
        if is_unit:
            cleaned[col] = series.apply(
                lambda v: _parse_unit(str(v))[0] if pd.notna(v) else pd.NA
            )
            continue

        t = infer_column_type(series)

        if t in ('integer', 'float'):
            stripped = (series.astype(str).str.strip()
                        .str.replace(r'[$,€£¥%\s]', '', regex=True))
            numeric = pd.to_numeric(stripped, errors='coerce')
            cleaned[col] = numeric.astype('Int64') if t == 'integer' else numeric

        elif t == 'date':
            try:
                cleaned[col] = (pd.to_datetime(series, errors='coerce')
                                  .dt.strftime('%Y-%m-%d'))
            except Exception:
                pass

        elif t == 'boolean':
            cleaned[col] = series.astype(str).str.lower().str.strip().map(BOOL_MAP)

        elif t == 'string':
            cleaned[col] = series.astype(str).str.strip().replace('nan', pd.NA)

    return cleaned


# ── Duplicate detection ────────────────────────────────────────────────────

def detect_duplicates(df: pd.DataFrame) -> dict:
    n = int(df.duplicated().sum())
    return {
        'duplicate_row_count': n,
        'duplicate_pct': round(n / len(df) * 100, 1) if len(df) else 0,
    }


# ── Outlier detection (IQR) ────────────────────────────────────────────────

def detect_outliers(series: pd.Series) -> dict:
    numeric = pd.to_numeric(series, errors='coerce').dropna()
    if len(numeric) < 4:
        return {}
    q1, q3 = numeric.quantile(0.25), numeric.quantile(0.75)
    iqr = q3 - q1
    if iqr == 0:
        return {}
    lo, hi   = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    outliers  = numeric[(numeric < lo) | (numeric > hi)]
    if len(outliers) == 0:
        return {}
    return {
        'outlier_count':     int(len(outliers)),
        'outlier_pct':       round(len(outliers) / len(numeric) * 100, 1),
        'iqr_lower_fence':   round(float(lo), 4),
        'iqr_upper_fence':   round(float(hi), 4),
        'outlier_sample':    [round(float(v), 4) for v in outliers.head(5).tolist()],
    }


# ── DDL generation ─────────────────────────────────────────────────────────

_SQL_TYPES = {
    'integer': 'INTEGER',
    'float':   'DECIMAL(18,4)',
    'date':    'DATE',
    'boolean': 'BOOLEAN',
    'empty':   'VARCHAR(255)',
}

def generate_ddl(table_name: str, columns: list) -> str:
    lines  = [f"CREATE TABLE {table_name} ("]
    defs   = []
    for col in columns:
        t        = col['inferred_type']
        sql_type = _SQL_TYPES.get(t)
        if sql_type is None:  # string
            max_len  = col.get('max_length', 255)
            sql_type = f"VARCHAR({max(max_len * 2, 50)})"

        nullable = '' if col['null_count'] > 0 else ' NOT NULL'
        comments = []
        if col.get('is_likely_key'):
            comments.append('PRIMARY KEY candidate')
        if col.get('is_index_candidate'):
            comments.append('INDEX candidate')
        if col.get('unit_multiplier'):
            comments.append(f"values normalized from {col['unit_multiplier'].upper()} units")
        suffix = f"  -- {', '.join(comments)}" if comments else ''
        defs.append(f"    {col['clean_name']} {sql_type}{nullable}{suffix}")

    lines.append(',\n'.join(defs))
    lines.append(');')
    return '\n'.join(lines)


# ── Column profiling ───────────────────────────────────────────────────────

def _sf(val):
    try:
        return None if pd.isna(val) else float(val)
    except Exception:
        return None


def profile_dataframe(df: pd.DataFrame, original_columns: list,
                      dup_info: dict, unpivot_info) -> dict:
    columns = []
    for orig, clean in zip(original_columns, df.columns):
        series = df[clean]
        t      = infer_column_type(series)

        is_unit, unit_suffix = _is_unit_column(series.dropna())
        null_count  = int(series.isnull().sum())
        unique_count = int(series.nunique())
        max_length   = int(series.astype(str).str.len().max()) if len(series) else 0
        is_likely_key = (
            t in ('integer', 'string')
            and unique_count == int(series.notna().sum())
            and int(series.notna().sum()) > 1
        )
        is_index_candidate = t == 'string' and 2 <= unique_count <= 20

        # Quality issues
        issues = []
        if null_count:
            issues.append(f"{null_count} null values ({round(null_count/len(series)*100,1)}%)")

        if t == 'string':
            stripped = (series.dropna().astype(str).str.strip()
                        .str.replace(r'[$,€£¥%]', '', regex=True))
            num_like = pd.to_numeric(stripped, errors='coerce').notna().sum()
            str_only = len(series.dropna()) - num_like
            if 0 < num_like < len(series.dropna()) and str_only > 0:
                issues.append(f"mixed types: {num_like} numeric-looking, {str_only} text")

        outlier_info = {}
        if t in ('integer', 'float'):
            outlier_info = detect_outliers(series)
            if outlier_info:
                issues.append(
                    f"{outlier_info['outlier_count']} outliers "
                    f"({outlier_info['outlier_pct']}%) outside IQR fences"
                )

        if is_unit:
            issues.append(
                f"unit-suffixed values ({unit_suffix.upper()}× multiplier) — normalized to raw numbers"
            )

        col_info = {
            'original_name':       orig,
            'clean_name':          clean,
            'inferred_type':       t,
            'total_rows':          len(series),
            'null_count':          null_count,
            'null_pct':            round(null_count / len(series) * 100, 1) if len(series) else 0,
            'unique_count':        unique_count,
            'is_likely_key':       is_likely_key,
            'is_index_candidate':  is_index_candidate,
            'max_length':          max_length,
            'sample_values':       [str(v) for v in series.dropna().head(5).tolist()],
            'quality_issues':      issues,
        }

        if outlier_info:
            col_info['outliers'] = outlier_info

        if t in ('integer', 'float'):
            try:
                num = pd.to_numeric(series, errors='coerce')
                col_info.update({
                    'min': _sf(num.min()), 'max': _sf(num.max()),
                    'mean': _sf(round(num.mean(), 2)), 'median': _sf(num.median()),
                })
            except Exception:
                pass

        if t == 'date':
            try:
                dates = pd.to_datetime(series, errors='coerce')
                col_info['date_min'] = str(dates.min().date()) if pd.notna(dates.min()) else None
                col_info['date_max'] = str(dates.max().date()) if pd.notna(dates.max()) else None
            except Exception:
                pass

        if t == 'string' and unique_count <= 20:
            col_info['value_counts'] = {
                str(k): int(v) for k, v in series.value_counts().head(10).items()
            }

        if is_unit:
            col_info['unit_multiplier'] = unit_suffix

        columns.append(col_info)

    total_issues       = sum(len(c['quality_issues']) for c in columns)
    columns_with_issues = [c['clean_name'] for c in columns if c['quality_issues']]

    profile = {
        'row_count':             len(df),
        'column_count':          len(df.columns),
        'total_quality_issues':  total_issues,
        'columns_with_issues':   columns_with_issues,
        'duplicate_rows':        dup_info,
        'columns':               columns,
        'generated_at':          datetime.now().isoformat(),
    }
    if unpivot_info:
        profile['unpivot_applied'] = unpivot_info
    return profile


# ── Cross-sheet relationship detection ────────────────────────────────────

def detect_sheet_relationships(sheet_profiles: dict) -> list:
    """Find columns shared across sheets — potential JOIN keys."""
    relationships = []
    names = list(sheet_profiles.keys())
    for i, a in enumerate(names):
        cols_a = {c['clean_name'] for c in sheet_profiles[a]['columns']}
        for b in names[i+1:]:
            cols_b  = {c['clean_name'] for c in sheet_profiles[b]['columns']}
            shared  = sorted(cols_a & cols_b)
            if shared:
                key = shared[0]
                relationships.append({
                    'sheet_a':        a,
                    'sheet_b':        b,
                    'shared_columns': shared,
                    'suggested_join': (
                        f"SELECT * FROM {to_snake_case(a)} a\n"
                        f"  JOIN {to_snake_case(b)} b ON a.{key} = b.{key};"
                    ),
                })
    return relationships


# ── Single-sheet processing ────────────────────────────────────────────────

def process_sheet(df: pd.DataFrame, stem: str, output_dir: Path,
                  sheet_suffix: str = '', no_unpivot: bool = False,
                  keep_dupes: bool = False, header_row_detected: int = 0) -> dict:
    """
    Run the full pipeline on one dataframe, write outputs, return profile.
    """
    original_columns = list(df.columns)

    # Wide-to-long unpivot
    unpivot_info = None
    if not no_unpivot:
        df, unpivot_info = detect_and_unpivot(df)
        if unpivot_info:
            original_columns = list(df.columns)

    # Normalize column names
    clean_names = deduplicate_columns([to_snake_case(c) for c in original_columns])
    df.columns  = clean_names

    # Duplicates
    dup_info = detect_duplicates(df)
    if not keep_dupes and dup_info['duplicate_row_count'] > 0:
        df = df.drop_duplicates().reset_index(drop=True)

    # Profile (capture issues before type casting)
    profile = profile_dataframe(df, original_columns, dup_info, unpivot_info)

    # Add header-detection note if applicable
    if header_row_detected > 0:
        profile['header_row_detected'] = header_row_detected
        profile['metadata_rows_skipped'] = header_row_detected

    # Type casting
    df = apply_cleaning(df)

    # DDL
    profile['ddl'] = generate_ddl(to_snake_case(stem + sheet_suffix), profile['columns'])

    # Write outputs
    fstem       = f"{stem}{sheet_suffix}"
    csv_path    = output_dir / f"{fstem}_clean.csv"
    profile_path = output_dir / f"{fstem}_profile.json"
    ddl_path    = output_dir / f"{fstem}_schema.sql"

    df.to_csv(csv_path, index=False)
    with open(profile_path, 'w') as f:
        json.dump(profile, f, indent=2, default=str)
    with open(ddl_path, 'w') as f:
        f.write(profile['ddl'])

    print(f"  ✓ {csv_path.name}  ({len(df)} rows × {len(df.columns)} cols)")
    print(f"  ✓ {profile_path.name}")
    print(f"  ✓ {ddl_path.name}")

    if header_row_detected > 0:
        print(f"  ℹ Skipped {header_row_detected} metadata row(s) above header")
    if unpivot_info:
        print(f"  ↔ Unpivoted: {unpivot_info['date_columns_count']} period columns → long format")
    if dup_info['duplicate_row_count'] and not keep_dupes:
        print(f"  ⚠  Removed {dup_info['duplicate_row_count']} duplicate row(s)")

    return profile


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Excel/CSV → SQL-ready CSV converter (v2)'
    )
    parser.add_argument('input_file')
    parser.add_argument('--output-dir',  default=None,
                        help='Output directory (default: same as input)')
    parser.add_argument('--sheet',       default='0',
                        help='Sheet name, 0-based index, or "all" (default: 0)')
    parser.add_argument('--header-row',  type=int, default=None,
                        help='Force header row index (0-based). Default: auto-detect')
    parser.add_argument('--no-unpivot',  action='store_true',
                        help='Disable auto wide-to-long unpivot')
    parser.add_argument('--keep-dupes',  action='store_true',
                        help='Keep duplicate rows (default: remove)')
    args = parser.parse_args()

    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    output_dir = Path(args.output_dir) if args.output_dir else input_path.parent
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = input_path.stem
    ext  = input_path.suffix.lower()

    print(f"\n📂 Processing: {input_path.name}")

    # Encoding (CSV only)
    encoding = 'utf-8'
    if ext == '.csv':
        encoding = detect_encoding(input_path)
        if encoding.lower() not in ('utf-8', 'utf-8-sig', 'ascii'):
            print(f"  ℹ Detected encoding: {encoding}")

    # ── Multi-sheet ──────────────────────────────────────────────────────
    if ext in ('.xlsx', '.xls', '.xlsm') and str(args.sheet).lower() == 'all':
        sheet_names = pd.ExcelFile(input_path).sheet_names
        print(f"  ℹ Processing all {len(sheet_names)} sheet(s): {sheet_names}")

        all_profiles: dict = {}
        for sname in sheet_names:
            print(f"\n  📋 Sheet: '{sname}'")
            df, hrow, _ = load_file(input_path, sheet=sname,
                                    header_row=args.header_row, encoding=encoding)
            profile = process_sheet(
                df, stem, output_dir,
                sheet_suffix='_' + to_snake_case(sname),
                no_unpivot=args.no_unpivot,
                keep_dupes=args.keep_dupes,
                header_row_detected=hrow,
            )
            all_profiles[sname] = profile

        rels = detect_sheet_relationships(all_profiles)
        if rels:
            rel_path = output_dir / f"{stem}_relationships.json"
            with open(rel_path, 'w') as f:
                json.dump(rels, f, indent=2)
            print(f"\n  🔗 {len(rels)} cross-sheet relationship(s) → {rel_path.name}")
            for r in rels:
                print(f"     {r['sheet_a']} ↔ {r['sheet_b']}  via: {r['shared_columns']}")

    # ── Single sheet ─────────────────────────────────────────────────────
    else:
        try:
            sheet = int(args.sheet)
        except (ValueError, TypeError):
            sheet = args.sheet

        df, hrow, sheet_names = load_file(input_path, sheet=sheet,
                                          header_row=args.header_row, encoding=encoding)

        print(f"  Loaded: {len(df)} rows × {len(df.columns)} cols")

        if sheet_names and len(sheet_names) > 1:
            others = [s for i, s in enumerate(sheet_names) if i != (sheet if isinstance(sheet, int) else 0)]
            print(f"  ℹ Excel has {len(sheet_names)} sheets. Processing first.")
            print(f"     Others: {others[:4]}{'…' if len(others) > 4 else ''}")
            print(f"     Use --sheet 'Name' or --sheet all to process others.")

        process_sheet(
            df, stem, output_dir,
            no_unpivot=args.no_unpivot,
            keep_dupes=args.keep_dupes,
            header_row_detected=hrow,
        )

    print(f"\n✅ Done. Outputs in: {output_dir}\n")


if __name__ == '__main__':
    main()
