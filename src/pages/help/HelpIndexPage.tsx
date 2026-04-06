import { Link } from 'react-router-dom'
import Navigation from '../../components/Navigation'
import { HELP_TOPICS } from '../../constants/helpTopics'

export default function HelpIndexPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navigation />

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Help & Documentation</h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Learn how to use the DataAnalyzer application
          </p>
        </div>

        {/* Topic Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {HELP_TOPICS.map(topic => (
            <Link
              key={topic.slug}
              to={`/help/${topic.slug}`}
              className="group bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 hover:shadow-lg dark:hover:shadow-gray-800/50 hover:border-blue-200 dark:hover:border-blue-800 transition-all"
            >
              <div className="flex items-start gap-4">
                <span className="text-4xl">{topic.icon}</span>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-1">
                    {topic.title}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    {topic.description}
                  </p>
                </div>
                <svg className="w-5 h-5 text-gray-400 dark:text-gray-600 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex-shrink-0 mt-1">
                  <path fill="currentColor" d="M13 7l5 5m0 0l-5 5m5-5H6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800 text-center text-gray-600 dark:text-gray-400 text-sm">
          <p>Can't find what you're looking for? Contact support for additional help.</p>
        </div>
      </div>
    </div>
  )
}
