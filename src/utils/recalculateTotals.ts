/**
 * Post-processes AI-generated report HTML to fix miscalculated totals.
 * Scans <ul>/<ol> lists and <table> elements for total rows and
 * recomputes their numeric values from the individual items.
 */
export function recalculateTotals(html: string): string {
  if (!html) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let changed = false

  // ── Lists (<ul> and <ol>) ─────────────────────────────────────────────────
  doc.querySelectorAll('ul, ol').forEach(list => {
    const items = Array.from(list.querySelectorAll(':scope > li'))
    if (items.length < 2) return

    // Find total item — last <li> whose text starts with "total" or "grand total"
    let totalIdx = -1
    for (let i = items.length - 1; i >= 0; i--) {
      if (/^\s*(grand\s+)?total\b/i.test(items[i].textContent ?? '')) { totalIdx = i; break }
    }
    if (totalIdx < 1) return

    const totalItem = items[totalIdx]
    const valueItems = items.slice(0, totalIdx)

    const values = valueItems.map(li => parseNumber(li.textContent ?? ''))
    if (values.some(v => v === null)) return  // skip if any item is non-numeric
    const sum = (values as number[]).reduce((a, b) => a + b, 0)

    const statedTotal = parseNumber(totalItem.textContent ?? '')
    if (statedTotal === null) return
    if (Math.abs(sum - statedTotal) < 0.005) return  // already correct

    replaceNumber(totalItem, statedTotal, sum)
    changed = true
  })

  // ── Tables ────────────────────────────────────────────────────────────────
  doc.querySelectorAll('table').forEach(table => {
    const rows = Array.from(table.querySelectorAll('tr'))
    if (rows.length < 2) return

    // Find total row — first cell matches "total" or "grand total"
    let totalRowIdx = -1
    for (let i = rows.length - 1; i >= 0; i--) {
      const firstCell = rows[i].querySelector('th, td')
      if (firstCell && /^\s*(grand\s+)?total\b/i.test(firstCell.textContent ?? '')) { totalRowIdx = i; break }
    }
    if (totalRowIdx < 1) return

    const totalRow = rows[totalRowIdx]
    const dataRows = rows.slice(0, totalRowIdx).filter(tr => !tr.querySelector('th'))
    if (dataRows.length === 0) return

    const totalCells = Array.from(totalRow.querySelectorAll('td'))
    totalCells.forEach((cell, colIdx) => {
      if (colIdx === 0) return  // skip label column
      const statedTotal = parseNumber(cell.textContent ?? '')
      if (statedTotal === null) return

      const colValues = dataRows.map(tr => {
        const cells = tr.querySelectorAll('td')
        return cells[colIdx] ? parseNumber(cells[colIdx].textContent ?? '') : null
      })
      if (colValues.some(v => v === null)) return
      const sum = (colValues as number[]).reduce((a, b) => a + b, 0)
      if (Math.abs(sum - statedTotal) < 0.005) return

      replaceNumber(cell, statedTotal, sum)
      changed = true
    })
  })

  if (!changed) return html
  return doc.body.innerHTML
}

/** Extract the first number from a text string (handles commas, currency symbols). Returns null if none found. */
function parseNumber(text: string): number | null {
  const clean = text.replace(/[$£€,]/g, '').match(/-?\d+(\.\d+)?/)
  if (!clean) return null
  return parseFloat(clean[0])
}

/** Replace the numeric portion of an element's innerHTML, preserving surrounding label text and formatting. */
function replaceNumber(el: Element, oldVal: number, newVal: number): void {
  const oldStr = formatNumber(oldVal)
  const newStr = formatNumber(newVal)
  el.innerHTML = el.innerHTML.replace(
    new RegExp(escapeRegex(oldStr), 'g'),
    newStr
  )
  // Fallback: try matching the plain integer string if comma-formatted replacement didn't match
  const oldInt = String(Math.round(oldVal))
  if (el.innerHTML.includes(oldInt)) {
    el.innerHTML = el.innerHTML.replace(
      new RegExp('\\b' + escapeRegex(oldInt) + '\\b', 'g'),
      newStr
    )
  }
}

function formatNumber(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString('en-US')
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
