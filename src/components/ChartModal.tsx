import { useRef, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
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
    const svgEl = chartAreaRef.current.querySelector('svg')
    if (!svgEl) return
    const svgClone = svgEl.cloneNode(true) as SVGSVGElement
    if (!svgClone.getAttribute('xmlns'))
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const { width, height } = svgEl.getBoundingClientRect()
    if (width > 0) svgClone.setAttribute('width', String(Math.round(width)))
    if (height > 0) svgClone.setAttribute('height', String(Math.round(height)))
    onInsert(`<div class="report-chart-embed">${svgClone.outerHTML}</div>`)
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
                  <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} />
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
                  />
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
                  outerRadius={140}
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
