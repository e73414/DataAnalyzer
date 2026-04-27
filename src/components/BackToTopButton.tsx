interface BackToTopButtonProps {
  scrollContainerRef?: { current: HTMLElement | null }
  className?: string
}

export default function BackToTopButton({ scrollContainerRef, className = '' }: BackToTopButtonProps) {
  const scrollToTop = () => {
    const scrollContainer = scrollContainerRef?.current
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      title="Scroll to top"
      className={`fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-white/50 bg-gray-900/45 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-gray-900/70 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:border-gray-700/70 dark:bg-white/20 dark:hover:bg-white/30 ${className}`}
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
      </svg>
    </button>
  )
}
