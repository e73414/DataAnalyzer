import os
import io
import zipfile
import tempfile
import subprocess
import shutil
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import StreamingResponse

app = FastAPI(
    title="Excel → SQL CSV Converter",
    description="Converts Excel/CSV files into SQL-ready long-format CSVs.",
    version="1.0.0",
)

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", 50)) * 1024 * 1024
CONVERT_SCRIPT   = Path(__file__).parent / "scripts" / "convert.py"


# ── Health check ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


# ── Main conversion endpoint ──────────────────────────────────────────────────

@app.post(
    "/convert",
    summary="Convert a file to SQL-ready CSV",
    response_description="ZIP archive containing: *_clean.csv, *_profile.json, *_schema.sql",
)
async def convert(
    file: UploadFile = File(..., description="Excel (.xlsx/.xls) or CSV file"),
    sheet: str       = Query("0",    description="Sheet name or 0-based index. Use 'all' for every sheet."),
    no_unpivot: bool = Query(False,  description="Disable automatic wide-to-long unpivot"),
    keep_dupes: bool = Query(False,  description="Keep duplicate rows (default: remove)"),
    header_row: int  = Query(None,   description="Force header row index (0-based). Default: auto-detect"),
):
    # ── Validate upload size ──────────────────────────────────────────────
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_UPLOAD_BYTES // (1024*1024)} MB.",
        )

    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".xlsx", ".xls", ".xlsm", ".csv"):
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{suffix}'. Accepted: .xlsx, .xls, .xlsm, .csv",
        )

    workdir = Path(tempfile.mkdtemp())
    try:
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
