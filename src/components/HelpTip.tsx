import { useState } from 'react'

interface HelpTipProps {
  text: string
  side?: 'above' | 'right' | 'left'
  className?: string
}

export default function HelpTip({ text, side = 'above', className = '' }: HelpTipProps) {
  const [isOpen, setIsOpen] = useState(false)

  const getPositionClasses = () => {
    switch (side) {
      case 'right':
        return 'top-1/2 left-full -translate-y-1/2 ml-2'
      case 'left':
        return 'top-1/2 right-full -translate-y-1/2 mr-2'
      case 'above':
      default:
        return 'bottom-full left-1/2 -translate-x-1/2 mb-2'
    }
  }

  const getArrowClasses = () => {
    switch (side) {
      case 'right':
        return 'right-full top-1/2 -translate-y-1/2 border-r-gray-800 dark:border-r-gray-100'
      case 'left':
        return 'left-full top-1/2 -translate-y-1/2 border-l-gray-800 dark:border-l-gray-100'
      case 'above':
      default:
        return 'top-full left-1/2 -translate-x-1/2 border-t-gray-800 dark:border-t-gray-100'
    }
  }

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onBlur={() => setIsOpen(false)}
        tabIndex={0}
        className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
        title={text}
      >
        ?
      </button>

      {isOpen && (
        <div className={`fixed ${getPositionClasses()} w-56 pointer-events-none z-[9999]`}>
          <div className="bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 text-sm rounded-lg px-3 py-2 leading-relaxed shadow-lg">
            {text}
            <div
              className={`absolute w-0 h-0 border-4 border-transparent ${getArrowClasses()}`}
            />
          </div>
        </div>
      )}
    </div>
  )
}
