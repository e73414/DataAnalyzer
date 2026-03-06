import { useRef, useState } from 'react'
import { extractTableData } from '../utils/tableToChartData'
import ChartModal from './ChartModal'
import type { ChartData } from '../utils/tableToChartData'

type VisualizableTableProps = React.HTMLAttributes<HTMLTableElement> & { node?: unknown }

export default function VisualizableTable({ children, node: _node, ...rest }: VisualizableTableProps) {
  const tableRef = useRef<HTMLTableElement>(null)
  const [chartData, setChartData] = useState<ChartData | null>(null)

  const handleChartClick = () => {
    if (!tableRef.current) return
    const parsed = extractTableData(tableRef.current)
    if (parsed && parsed.numericColumnIndices.length > 0) setChartData(parsed)
  }

  return (
    <div className="relative">
      <button
        onClick={handleChartClick}
        className="chart-viz-btn"
        aria-label="Visualize table as chart"
      >
        ▲ Chart
      </button>
      <table ref={tableRef} {...rest}>
        {children}
      </table>
      {chartData && <ChartModal data={chartData} onClose={() => setChartData(null)} />}
    </div>
  )
}
