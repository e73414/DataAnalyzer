import { Link, useNavigate } from 'react-router-dom'
import Navigation from '../../components/Navigation'
import { HelpTopic } from '../../constants/helpTopics'

export interface HelpSection {
  heading: string
  body: string
  screenshot?: string
  steps?: string[]
}

interface HelpPageLayoutProps {
  topic: HelpTopic
  sections: HelpSection[]
}

export default function HelpPageLayout({ topic, sections }: HelpPageLayoutProps) {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navigation />

      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-6">
          <Link to="/help" className="hover:text-gray-900 dark:hover:text-gray-200">
            Help
          </Link>
          <span>/</span>
          <span>{topic.title}</span>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">{topic.icon}</span>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{topic.title}</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">{topic.description}</p>
        </div>

        {/* Open Page Button */}
        <div className="mb-8">
          <button
            onClick={() => navigate(topic.appPath)}
            className="btn-secondary inline-flex items-center gap-2"
          >
            Open {topic.title}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-gray-800 mb-8" />

        {/* Sections */}
        <div className="space-y-8">
          {sections.map((section, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6"
            >
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                {section.heading}
              </h2>

              <p className="text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
                {section.body}
              </p>

              {section.steps && section.steps.length > 0 && (
                <div className="mb-4">
                  <div className="space-y-2">
                    {section.steps.map((step, stepIdx) => (
                      <div key={stepIdx} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                          {stepIdx + 1}
                        </div>
                        <p className="text-gray-700 dark:text-gray-300 pt-0.5">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {section.screenshot && (
                <div className="mt-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
                  <img
                    src={`/help/${topic.slug}/${section.screenshot}`}
                    alt={section.heading}
                    className="w-full h-auto"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Back Button */}
        <div className="mt-12">
          <Link
            to="/help"
            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Help
          </Link>
        </div>
      </div>
    </div>
  )
}
