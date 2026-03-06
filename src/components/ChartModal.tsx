import { useRef, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from 'recharts'
import type { ChartData } from '../utils/tableToChartData'

type ChartType = 'bar' | 'line' | 'pie'

interface ChartModalProps {
  data: ChartData
  onClose: () => void
  onInsert?: (svgHtml: string) => void
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

function getDefaultChartType(data: ChartData): ChartType {
  const numericCount = data.numericColumnIndices.length
  const rowCount = data.rows.length
  if (numericCount === 1 && rowCount <= 8) return 'pie'
  const firstLabel = String(data.rows[0]?.[data.labelColumnIndex] ?? '')
  if (/\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(firstLabel)) return 'line'
  return 'bar'
}

function formatDataLabel(value: unknown): string {
  if (typeof value !== 'number') return String(value ?? '')
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  if (Number.isInteger(value)) return String(value)
  return parseFloat(value.toFixed(2)).toString()
}

function buildRechartsData(data: ChartData): Record<string, string | number>[] {
  return data.rows.map(row => {
    const entry: Record<string, string | number> = { label: String(row[data.labelColumnIndex]) }
    data.numericColumnIndices.forEach(i => {
      entry[data.headers[i]] = row[i] as number
    })
    return entry
  })
}

export default function ChartModal({ data, onClose, onInsert }: ChartModalProps) {
  const [chartType, setChartType] = useState<ChartType>(() => getDefaultChartType(data))
  const chartAreaRef = useRef<HTMLDivElement>(null)
  const rechartsData = buildRechartsData(data)
  const numericKeys = data.numericColumnIndices.map(i => data.headers[i])

  const handleInsert = () => {
    if (!chartAreaRef.current || !onInsert) return
    // Target the main recharts chart SVG (direct child of .recharts-wrapper),
    // not the tiny 14×14 legend-icon SVGs that recharts also renders inside the chart area
    const svgEl = (
      chartAreaRef.current.querySelector<SVGSVGElement>('.recharts-wrapper > svg') ??
      chartAreaRef.current.querySelector<SVGSVGElement>('svg')
    )
    if (!svgEl) return
    const svgClone = svgEl.cloneNode(true) as SVGSVGElement
    if (!svgClone.getAttribute('xmlns'))
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const rect = svgEl.getBoundingClientRect()
    const w = rect.width > 0 ? Math.round(rect.width) : (parseInt(svgEl.getAttribute('width') ?? '0') || 600)
    const h = rect.height > 0 ? Math.round(rect.height) : (parseInt(svgEl.getAttribute('height') ?? '0') || 400)
    svgClone.setAttribute('viewBox', `0 0 ${w} ${h}`)
    // SVG fills its absolutely-positioned slot; outer wrapper enforces aspect ratio
    // via padding-top trick so height is always correct regardless of browser behaviour
    svgClone.setAttribute('width', '100%')
    svgClone.setAttribute('height', '100%')
    const existingStyle = svgClone.getAttribute('style') ?? ''
    const styleBase = existingStyle.replace(/\b(?:width|height|overflow)\s*:[^;]*(;|$)/gi, '').replace(/;+$/, '').trim()
    // overflow:visible overrides recharts' .recharts-surface { overflow:hidden } so
    // pie/line labels that sit near the SVG edge aren't clipped in the static embed
    svgClone.setAttribute('style', [styleBase, 'position:absolute;top:0;left:0;display:block;overflow:visible'].filter(Boolean).join(';'))
    const paddingPct = ((h / w) * 100).toFixed(4)
    onInsert(
      `<div class="report-chart-embed">` +
      `<div style="position:relative;width:${w}px;max-width:100%;padding-top:${paddingPct}%;">` +
      svgClone.outerHTML +
      `</div></div>`
    )
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2 flex-wrap">
            {(['bar', 'line', 'pie'] as ChartType[]).map(type => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                className={`px-3 py-1 text-sm rounded border transition-colors ${
                  chartType === type
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
            {onInsert && (
              <button
                onClick={handleInsert}
                className="px-3 py-1 text-sm rounded border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                title="Embed chart into report"
              >
                ↩ Insert
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none font-bold ml-2"
            aria-label="Close chart"
          >
            ×
          </button>
        </div>

        {/* Chart */}
        <div ref={chartAreaRef} style={{ height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={rechartsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#4b5563" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {numericKeys.map((key, i) => (
                  <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]}>
                    <LabelList dataKey={key} position="top" formatter={formatDataLabel} style={{ fill: '#6b7280', fontSize: 11 }} />
                  </Bar>
                ))}
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={rechartsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#4b5563" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {numericKeys.map((key, i) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={COLORS[i % COLORS.length]}
                    dot={rechartsData.length <= 30}
                    strokeWidth={2}
                  >
                    <LabelList dataKey={key} position="top" formatter={formatDataLabel} style={{ fill: '#6b7280', fontSize: 11 }} />
                  </Line>
                ))}
              </LineChart>
            ) : (
              <PieChart>
                <Pie
                  data={rechartsData}
                  dataKey={numericKeys[0]}
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  isAnimationActive={false}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {rechartsData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
