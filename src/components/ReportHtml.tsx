import { useRef, useEffect } from 'react'

function downloadTableAsCSV(table: HTMLTableElement, tableIndex: number) {
  const rows = Array.from(table.querySelectorAll('tr'))
  const csv = rows.map(row => {
    const cells = Array.from(row.querySelectorAll('th, td'))
    return cells.map(cell => {
      const text = (cell.textContent ?? '').trim()
      return /[,"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }).join(',')
  }).join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `table-${tableIndex}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

interface ReportHtmlProps {
  html: string
  className?: string
}

export default function ReportHtml({ html, className }: ReportHtmlProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !html) return

    const tables = Array.from(container.querySelectorAll('table'))
    tables.forEach((table, index) => {
      if (table.parentElement?.classList.contains('report-table-wrapper')) return

      const wrapper = document.createElement('div')
      wrapper.className = 'report-table-wrapper'

      const btn = document.createElement('button')
      btn.className = 'csv-download-btn'
      btn.innerHTML = '&#x2B07; Download CSV'
      btn.title = 'Download table as CSV'
      btn.addEventListener('click', () => downloadTableAsCSV(table, index + 1))

      table.parentNode?.insertBefore(wrapper, table)
      wrapper.appendChild(btn)
      wrapper.appendChild(table)
    })
  }, [html])

  return (
    <div
      ref={containerRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
