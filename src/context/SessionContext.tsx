import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { Session } from '../types'

const SESSION_KEY = 'data-analyzer-session'
const SESSION_EXPIRY_HOURS = 24

interface SessionContextType {
  session: Session | null
  login: (email: string, model?: string) => void
  logout: () => void
  setAIModel: (model: string) => void
  isLoggedIn: boolean
}

const SessionContext = createContext<SessionContextType | undefined>(undefined)

function loadSession(): Session | null {
  try {
    const data = localStorage.getItem(SESSION_KEY)
    if (!data) return null

    const session = JSON.parse(data) as Session
    const expiryMs = SESSION_EXPIRY_HOURS * 60 * 60 * 1000
    if (Date.now() - session.loginTime > expiryMs) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return session
  } catch {
    return null
  }
}

function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession())

  const login = useCallback((email: string, model?: string) => {
    const newSession: Session = {
      email,
      aiModel: model || '',
      loginTime: Date.now(),
    }
    saveSession(newSession)
    setSession(newSession)
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setSession(null)
  }, [])

  const setAIModel = useCallback((model: string) => {
    if (!session) return
    const updatedSession: Session = {
      ...session,
      aiModel: model,
    }
    saveSession(updatedSession)
    setSession(updatedSession)
  }, [session])

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SESSION_KEY) {
        setSession(loadSession())
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return (
    <SessionContext.Provider
      value={{
        session,
        login,
        logout,
        setAIModel,
        isLoggedIn: session !== null,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionContextType {
  const context = useContext(SessionContext)
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider')
  }
  return context
}
