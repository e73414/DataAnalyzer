export interface ChartData {
  headers: string[]
  rows: (string | number)[][]
  labelColumnIndex: number       // column used as X-axis / pie label
  numericColumnIndices: number[] // columns used as data series
}

export function extractTableData(table: HTMLTableElement): ChartData | null {
  const headerCells = Array.from(table.querySelectorAll('thead th, tr:first-child th'))
  if (headerCells.length === 0) return null
  const headers = headerCells.map(th => (th.textContent ?? '').trim())

  const dataRows = Array.from(table.querySelectorAll('tbody tr, tr'))
    .filter(tr => tr.querySelectorAll('td').length > 0)
    .map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td => {
        const text = (td.textContent ?? '').trim()
        // Strip common numeric decorators before parsing
        const cleaned = text.replace(/[$,%]/g, '').replace(/,/g, '')
        const num = parseFloat(cleaned)
        return isNaN(num) ? text : num
      })
    )

  if (dataRows.length === 0) return null

  // A column is numeric if ≥60% of its values parse as a number
  const numericColumnIndices: number[] = []
  headers.forEach((_, colIdx) => {
    const values = dataRows.map(row => row[colIdx])
    const numericCount = values.filter(v => typeof v === 'number').length
    if (numericCount / values.length >= 0.6) numericColumnIndices.push(colIdx)
  })

  // Label column = first non-numeric column; fall back to column 0
  const labelColumnIndex = headers.findIndex((_, i) => !numericColumnIndices.includes(i))

  return {
    headers,
    rows: dataRows,
    labelColumnIndex: labelColumnIndex === -1 ? 0 : labelColumnIndex,
    numericColumnIndices,
  }
}
