import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { useTheme } from '../context/ThemeContext'
import { useAppSettings } from '../context/AppSettingsContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import { findTopicByPath } from '../constants/helpTopics'
import UserPreferencesModal from './UserPreferencesModal'

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Sun icon for light mode
function SunIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  )
}

// Moon icon for dark mode
function MoonIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  )
}

export default function Navigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, logout } = useSession()
  const { theme, toggleTheme } = useTheme()
  const { appSettings } = useAppSettings()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const menuRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  const { data: navLinks, isLoading: isLoadingNavLinks } = useQuery({
    queryKey: ['navLinks'],
    queryFn: () => pocketbaseService.getNavLinks(),
    staleTime: 30 * 1000, // 30 seconds - refresh more frequently
  })

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleNavClick = (path: string) => {
    navigate(path)
    setIsMenuOpen(false)
  }

  const toggleGroup = (groupName: string) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(groupName)) {
      newExpanded.delete(groupName)
    } else {
      newExpanded.add(groupName)
    }
    setExpandedGroups(newExpanded)
  }

  const parseMenuItems = (links: typeof navLinks) => {
    const grouped: Record<string, NonNullable<typeof navLinks>> = {}
    const ungrouped: typeof navLinks = []

    links?.forEach((link) => {
      const match = link.name.match(/^([^:]+):\s*(.+)$/)
      if (match) {
        const [, prefix, name] = match
        if (!grouped[prefix]) {
          grouped[prefix] = []
        }
        grouped[prefix]!.push({ ...link, name })
      } else {
        ungrouped.push(link)
      }
    })

    return { grouped, ungrouped }
  }

  // Change Password modal state
  const [showPreferencesModal, setShowPreferencesModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const handleChangePassword = async () => {
    setPasswordError('')
    if (!newPassword || newPassword.length < 4) {
      setPasswordError('New password must be at least 4 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }
    if (!session?.email) return
    setIsChangingPassword(true)
    try {
      const profile = await pocketbaseService.getUserProfile(session.email)
      if (!profile) {
        setPasswordError('User profile not found.')
        return
      }
      // Verify current password
      if (profile.password_hash) {
        const currentHash = await sha256Hex(currentPassword)
        if (currentHash !== profile.password_hash) {
          setPasswordError('Current password is incorrect.')
          return
        }
      }
      // Save new password hash
      const newHash = await sha256Hex(newPassword)
      await pocketbaseService.updatePasswordHash(profile.id, newHash, session!.email)
      toast.success('Password changed successfully')
      setShowPasswordModal(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setIsChangingPassword(false)
    }
  }

  const currentPageTitle = (() => {
    const name = navLinks?.find((link) => link.path === location.pathname)?.name || 'Menu'
    return name.startsWith('Admin:') ? name.slice(6).trimStart() : name
  })()

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm dark:shadow-gray-900/50 transition-colors duration-200">
      <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <img src={theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'} alt={appSettings?.app_title || 'DataPilot'} className="h-12 w-auto" />
          <span className="text-2xl font-bold text-gray-900 dark:text-white" style={{fontFamily: "'Syne', sans-serif"}}>{appSettings?.app_title || 'DataPilot'}</span>
        </div>
        <div className="flex gap-2 items-center">
          {session?.email && (
            <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">{session.email}</span>
          )}
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200"
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
          </button>

          {/* Help Button */}
          {(() => {
            const helpTopic = findTopicByPath(location.pathname)
            const helpPath = helpTopic ? `/help/${helpTopic.slug}` : '/help'
            return (
              <Link
                to={helpPath}
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-600 border border-yellow-400 dark:border-yellow-700 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 hover:border-yellow-500 dark:hover:border-yellow-600 transition-colors"
                title="Help & Documentation"
              >
                ?
              </Link>
            )
          })()}

          {/* Navigation Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200 flex items-center gap-1"
            >
              {currentPageTitle}
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg ring-1 ring-black/5 dark:ring-white/10 z-10 overflow-hidden">
                <div className="py-1">
                  {isLoadingNavLinks ? (
                    <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Loading...</div>
                  ) : (() => {
                    const filteredLinks = navLinks?.filter((link) => {
                      const isAdmin = session?.profile?.trim() === 'admadmadm'
                      if (link.name.startsWith('Admin:')) return isAdmin
                      return true
                    }) || []
                    const { grouped, ungrouped } = parseMenuItems(filteredLinks)

                    return (
                      <>
                        {/* Ungrouped items */}
                        {ungrouped.map((link) => (
                          <div key={link.id}>
                            {link.separator_before && (
                              <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                            )}
                            <button
                              onClick={() => handleNavClick(link.path)}
                              className={`block w-full text-left px-4 py-2.5 text-sm transition-colors duration-150 ${
                                link.color === 'red'
                                  ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                  : location.pathname === link.path
                                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                              }`}
                            >
                              {link.name}
                            </button>
                          </div>
                        ))}

                        {/* Grouped items */}
                        {Object.entries(grouped).map(([groupName, groupLinks]) => {
                          const isExpanded = expandedGroups.has(groupName)
                          return (
                            <div key={groupName}>
                              {/* Group header */}
                              <button
                                onClick={() => toggleGroup(groupName)}
                                className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150 flex items-center justify-between group"
                              >
                                <span>{groupName}</span>
                                <svg
                                  className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>

                              {/* Group items */}
                              {isExpanded && (
                                <>
                                  {groupLinks.map((link) => (
                                    <button
                                      key={link.id}
                                      onClick={() => handleNavClick(link.path)}
                                      className={`block w-full text-left px-8 py-2.5 text-sm transition-colors duration-150 ${
                                        link.color === 'red'
                                          ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                          : location.pathname === link.path
                                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                                            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                      }`}
                                    >
                                      {link.name}
                                    </button>
                                  ))}
                                </>
                              )}
                            </div>
                          )
                        })}
                      </>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Settings Menu */}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            {isSettingsOpen && (
              <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-50">
                <button
                  onClick={() => {
                    setIsSettingsOpen(false)
                    setShowPreferencesModal(true)
                  }}
                  className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  My Preferences
                </button>
                <button
                  onClick={() => {
                    setIsSettingsOpen(false)
                    setShowPasswordModal(true)
                    setPasswordError('')
                    setCurrentPassword('')
                    setNewPassword('')
                    setConfirmPassword('')
                  }}
                  className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  Change PW
                </button>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                <button
                  onClick={() => {
                    setIsSettingsOpen(false)
                    handleLogout()
                  }}
                  className="block w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showPreferencesModal && session?.email && (
        <UserPreferencesModal
          email={session.email}
          onClose={() => setShowPreferencesModal(false)}
        />
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Change Password</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoComplete="new-password"
                />
              </div>
              {passwordError && (
                <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowPasswordModal(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleChangePassword}
                disabled={isChangingPassword}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-900 hover:bg-purple-800 rounded-lg disabled:opacity-50"
              >
                {isChangingPassword ? 'Saving...' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
