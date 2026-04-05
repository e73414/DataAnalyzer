import { useEffect, useState, useCallback, useMemo } from 'react'
import type { ChartData } from '../utils/tableToChartData'
import { useTheme } from '../context/ThemeContext'

type ChartType =
  | 'bar' | 'bar_grouped' | 'bar_stacked'
  | 'line' | 'pie'
  | 'scatter' | 'heatmap' | 'boxplot' | 'waterfall'

interface ChartModalProps {
  data: ChartData
  onClose: () => void
  onInsert?: (svgHtml: string) => void
}

const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: 'bar',         label: 'Bar' },
  { id: 'bar_grouped', label: 'Grouped Bar' },
  { id: 'bar_stacked', label: 'Stacked Bar' },
  { id: 'line',        label: 'Line' },
  { id: 'pie',         label: 'Pie' },
  { id: 'scatter',     label: 'Scatter' },
  { id: 'heatmap',     label: 'Heatmap' },
  { id: 'boxplot',     label: 'Box Plot' },
  { id: 'waterfall',   label: 'Waterfall' },
]

function detectDefaultType(data: ChartData): ChartType {
  const numSeries = data.numericColumnIndices.length
  const numRows = data.rows.length
  const firstLabel = String(data.rows[0]?.[data.labelColumnIndex] ?? '')
  if (numSeries === 1 && numRows <= 8) return 'pie'
  if (/\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(firstLabel)) return 'line'
  if (numSeries > 2) return 'bar_grouped'
  return 'bar'
}

function buildCsv(data: ChartData): string {
  const esc = (v: string | number) => {
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const lines = [data.headers.map(esc).join(',')]
  for (const row of data.rows) {
    lines.push(row.map(esc).join(','))
  }
  return lines.join('\n')
}

export default function ChartModal({ data, onClose, onInsert }: ChartModalProps) {
  const { theme } = useTheme()
  const [chartType, setChartType] = useState<ChartType>(() => detectDefaultType(data))
  const [svg, setSvg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const labelCol = useMemo(() => data.headers[data.labelColumnIndex], [data])
  const valueCols = useMemo(() => data.numericColumnIndices.map(i => data.headers[i]), [data])

  const fetchChart = useCallback(async (type: ChartType) => {
    setLoading(true)
    setError(null)
    setSvg(null)
    try {
      const res = await fetch('/excel-to-sql/chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart_type: type,
          csv_data: buildCsv(data),
          label_column: labelCol,
          value_columns: valueCols,
          theme,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error((err as { detail?: string }).detail || res.statusText)
      }
      const json = await res.json() as { svg: string }
      setSvg(json.svg)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Chart generation failed')
    } finally {
      setLoading(false)
    }
  }, [data, labelCol, valueCols, theme])

  useEffect(() => { fetchChart(chartType) }, [chartType, fetchChart])

  const handleInsert = () => {
    if (!svg || !onInsert) return
    // Make the SVG responsive: replace fixed width/height attrs with 100% so it
    // fills the report container rather than overflowing at its render-time pixel size.
    const responsiveSvg = svg.replace(
      /(<svg\b[^>]*)\swidth="[^"]*"/i, '$1 width="100%"'
    ).replace(
      /(<svg\b[^>]*)\sheight="[^"]*"/i, '$1 height="auto"'
    )
    onInsert(`<div class="report-chart-embed" style="margin:1rem 0;width:100%;">${responsiveSvg}</div>`)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl flex flex-col"
           style={{ width: 860, maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Chart</span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-xl leading-none font-bold"
            aria-label="Close chart"
          >
            ×
          </button>
        </div>

        {/* Chart type tabs */}
        <div className="flex flex-wrap gap-1.5 px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          {CHART_TYPES.map(ct => (
            <button
              key={ct.id}
              onClick={() => setChartType(ct.id)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                chartType === ct.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              {ct.label}
            </button>
          ))}
        </div>

        {/* Chart area */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-950"
             style={{ minHeight: 380 }}>
          {loading && (
            <span className="text-gray-400 text-sm animate-pulse">Generating chart…</span>
          )}
          {error && !loading && (
            <span className="text-red-500 dark:text-red-400 text-sm">Error: {error}</span>
          )}
          {svg && !loading && (
            <div
              className="w-full"
              style={{ maxWidth: 780 }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
          >
            Cancel
          </button>
          {onInsert && (
            <button
              onClick={handleInsert}
              disabled={!svg || loading}
              className="px-4 py-1.5 rounded text-xs bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 transition-colors"
            >
              ↩ Insert into Report
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
