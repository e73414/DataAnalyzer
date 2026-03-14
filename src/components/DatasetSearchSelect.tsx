import { useState, useRef, useEffect } from 'react'
import type { Dataset } from '../types'

interface DatasetSearchSelectProps {
  datasets: Dataset[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  placeholder?: string
  label?: string
}

export default function DatasetSearchSelect({
  datasets,
  value,
  onChange,
  disabled = false,
  placeholder = 'Search datasets...',
  label,
}: DatasetSearchSelectProps) {
  const [searchText, setSearchText] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync display text when value or datasets change
  useEffect(() => {
    if (value && datasets.length > 0) {
      const found = datasets.find(d => d.id === value)
      if (found) setSearchText(found.name)
    } else if (!value) {
      setSearchText('')
    }
  }, [value, datasets])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
        // If nothing selected, clear partial search text
        if (!value) setSearchText('')
        else {
          const found = datasets.find(d => d.id === value)
          if (found) setSearchText(found.name)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [value, datasets])

  const filtered = [...datasets]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(d => d.name.toLowerCase().includes(searchText.toLowerCase()))

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value)
    onChange('')
    setShowDropdown(true)
  }

  const handleSelect = (d: Dataset) => {
    onChange(d.id)
    setSearchText(d.name)
    setShowDropdown(false)
  }

  const handleClear = () => {
    onChange('')
    setSearchText('')
    setShowDropdown(true)
  }

  return (
    <div>
      {label && <label className="label">{label}</label>}
      <div className="relative" ref={containerRef}>
        <input
          type="text"
          value={searchText}
          onChange={handleInputChange}
          onFocus={() => setShowDropdown(true)}
          placeholder={placeholder}
          className="input-field w-full pr-8"
          disabled={disabled}
          autoComplete="off"
        />
        {searchText && !disabled && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); handleClear() }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700"
            tabIndex={-1}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {showDropdown && !disabled && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No datasets found</div>
            ) : (
              filtered.map(d => (
                <div
                  key={d.id}
                  onMouseDown={() => handleSelect(d)}
                  className={`px-3 py-2 cursor-pointer text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 ${value === d.id ? 'bg-blue-50 dark:bg-blue-900/30 font-medium' : ''}`}
                >
                  <div className="text-gray-900 dark:text-gray-100">
                    {d.name}{d.row_count != null ? ` (rows: ${d.row_count.toLocaleString()})` : ''}
                  </div>
                  {d.description && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{d.description}</div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
