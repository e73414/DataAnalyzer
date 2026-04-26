import os
import io
import zipfile
import tempfile
import subprocess
import shutil
from pathlib import Path
from typing import Optional

import json
import pdfplumber
import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

app = FastAPI(
    title="Excel → SQL CSV Converter",
    description="Converts Excel/CSV files into SQL-ready long-format CSVs.",
    version="1.0.0",
)

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", 50)) * 1024 * 1024
CONVERT_SCRIPT   = Path(__file__).parent / "scripts" / "convert.py"


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
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_UPLOAD_BYTES // (1024*1024)} MB.",
        )
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
        # 422 covers both invalid plan data (user-caused) and unexpected cleaning failures.
        # apply_cleaning_plan silently skips out-of-bounds references so genuine exceptions
        # here indicate malformed plan structure or corrupted CSV data.
        raise HTTPException(status_code=422, detail=f"Cleaning failed: {exc}")

    return CleanResponse(cleaned_csv=cleaned_csv, changes_applied=changes)


# ── Health check ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


# ── PDF info endpoint ─────────────────────────────────────────────────────────

@app.post(
    "/pdf-info",
    summary="Return page list with table counts for a PDF",
)
async def pdf_info(
    file: UploadFile = File(..., description="PDF file"),
):
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_UPLOAD_BYTES // (1024*1024)} MB.",
        )
    if Path(file.filename).suffix.lower() != ".pdf":
        raise HTTPException(status_code=415, detail="Only PDF files are accepted.")

    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            pages = []
            for i, page in enumerate(pdf.pages, start=1):
                tables = page.extract_tables()
                pages.append({"page_num": i, "table_count": len(tables)})
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to read PDF: {exc}")

    return {"pages": pages}


# ── Main conversion endpoint ──────────────────────────────────────────────────

@app.post(
    "/convert",
    summary="Convert a file to SQL-ready CSV",
    response_description="ZIP archive containing: *_clean.csv, *_profile.json, *_schema.sql",
)
async def convert(
    file: UploadFile = File(..., description="Excel (.xlsx/.xls), CSV, or PDF file"),
    sheet: str       = Query("0",    description="Sheet name or 0-based index. Use 'all' for every sheet."),
    no_unpivot: bool = Query(False,  description="Disable automatic wide-to-long unpivot"),
    keep_dupes: bool = Query(False,  description="Keep duplicate rows (default: remove)"),
    header_row: int  = Query(None,   description="Force header row index (0-based). Default: auto-detect"),
    page: int        = Query(1,      description="PDF page number (1-based). Only used for PDF files."),
):
    # ── Validate upload size ──────────────────────────────────────────────
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_UPLOAD_BYTES // (1024*1024)} MB.",
        )

    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".xlsx", ".xls", ".xlsm", ".csv", ".pdf"):
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{suffix}'. Accepted: .xlsx, .xls, .xlsm, .csv, .pdf",
        )

    workdir = Path(tempfile.mkdtemp())
    try:
        # ── PDF: extract table from specified page → temp CSV ─────────────
        if suffix == ".pdf":
            try:
                with pdfplumber.open(io.BytesIO(content)) as pdf:
                    if page < 1 or page > len(pdf.pages):
                        raise HTTPException(
                            status_code=422,
                            detail=f"Page {page} out of range. PDF has {len(pdf.pages)} page(s).",
                        )
                    tables = pdf.pages[page - 1].extract_tables()
                    if not tables:
                        raise HTTPException(
                            status_code=422,
                            detail=f"No table found on page {page}.",
                        )
                    # Use the largest table (most cells)
                    table = max(tables, key=lambda t: sum(len(r) for r in t))
                    # Clean None cells
                    rows = [[cell if cell is not None else "" for cell in row] for row in table]
                    df = pd.DataFrame(rows[1:], columns=rows[0])
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(status_code=422, detail=f"Failed to extract table from PDF: {exc}")

            stem = Path(file.filename).stem
            csv_name = f"{stem}_page{page}.csv"
            csv_path = workdir / csv_name
            df.to_csv(csv_path, index=False)

            # Run extracted CSV through the existing converter
            cmd = [
                "python", str(CONVERT_SCRIPT),
                str(csv_path),
                "--output-dir", str(workdir),
                "--sheet", "0",
            ]
            if no_unpivot:
                cmd.append("--no-unpivot")
            if keep_dupes:
                cmd.append("--keep-dupes")
            if header_row is not None:
                cmd.extend(["--header-row", str(header_row)])

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode != 0:
                raise HTTPException(
                    status_code=422,
                    detail=f"Conversion failed: {result.stderr.strip() or result.stdout.strip()}",
                )

            output_files = list(workdir.glob("*_clean.csv")) + \
                           list(workdir.glob("*_profile.json")) + \
                           list(workdir.glob("*_schema.sql")) + \
                           list(workdir.glob("*_relationships.json"))

            if not output_files:
                raise HTTPException(status_code=500, detail="Conversion produced no output files.")

            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
                for f in output_files:
                    zf.write(f, arcname=f.name)
            zip_buffer.seek(0)

            zip_stem = f"{stem}_page{page}"
            return StreamingResponse(
                zip_buffer,
                media_type="application/zip",
                headers={"Content-Disposition": f'attachment; filename="{zip_stem}_sql_ready.zip"'},
            )

        # ── Save upload ───────────────────────────────────────────────────
        src = workdir / file.filename
        src.write_bytes(content)

        # ── Build command ─────────────────────────────────────────────────
        cmd = [
            "python", str(CONVERT_SCRIPT),
            str(src),
            "--output-dir", str(workdir),
            "--sheet", sheet,
        ]
        if no_unpivot:
            cmd.append("--no-unpivot")
        if keep_dupes:
            cmd.append("--keep-dupes")
        if header_row is not None:
            cmd.extend(["--header-row", str(header_row)])

        # ── Run converter ─────────────────────────────────────────────────
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode != 0:
            raise HTTPException(
                status_code=422,
                detail=f"Conversion failed: {result.stderr.strip() or result.stdout.strip()}",
            )

        # ── Collect output files ──────────────────────────────────────────
        output_files = list(workdir.glob("*_clean.csv")) + \
                       list(workdir.glob("*_profile.json")) + \
                       list(workdir.glob("*_schema.sql")) + \
                       list(workdir.glob("*_relationships.json"))

        if not output_files:
            raise HTTPException(
                status_code=500,
                detail="Conversion produced no output files. Check the file format.",
            )

        # ── Pack into ZIP and stream back ─────────────────────────────────
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in output_files:
                zf.write(f, arcname=f.name)
        zip_buffer.seek(0)

        stem = Path(file.filename).stem
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{stem}_sql_ready.zip"'},
        )

    finally:
        shutil.rmtree(workdir, ignore_errors=True)


# ── Chart endpoint ────────────────────────────────────────────────────────────

class ChartRequest(BaseModel):
    chart_type: str = Field(..., description="bar|bar_grouped|bar_stacked|line|pie|scatter|heatmap|boxplot|waterfall")
    csv_data: str   = Field(..., description="Raw CSV string with header row")
    label_column: Optional[str]        = Field(default=None)
    value_columns: Optional[list[str]] = Field(default=None)
    title: Optional[str]               = Field(default=None)
    params: Optional[dict]             = Field(default=None)
    theme: Optional[str]               = Field(default='dark', description="'light' or 'dark'")


class ChartResponse(BaseModel):
    svg: str


_CHART_MODULE = None


def _get_chart():
    global _CHART_MODULE
    if _CHART_MODULE is None:
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "chart", Path(__file__).parent / "scripts" / "chart.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _CHART_MODULE = mod
    return _CHART_MODULE


@app.post("/chart", summary="Generate an SVG chart from CSV data", response_model=ChartResponse)
async def chart(request: ChartRequest):
    try:
        mod = _get_chart()
        svg = mod.render_chart(request.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chart error: {e}")
    return ChartResponse(svg=svg)
