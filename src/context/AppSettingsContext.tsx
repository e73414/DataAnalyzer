import { createContext, useContext, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import type { AppSettings } from '../types'

interface AppSettingsContextType {
  appSettings: AppSettings | null
  isLoadingSettings: boolean
  refetchSettings: () => void
}

const AppSettingsContext = createContext<AppSettingsContextType>({
  appSettings: null,
  isLoadingSettings: false,
  refetchSettings: () => {},
})

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => pocketbaseService.getAppSettings(),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <AppSettingsContext.Provider value={{
      appSettings: data ?? null,
      isLoadingSettings: isLoading,
      refetchSettings: refetch,
    }}>
      {children}
    </AppSettingsContext.Provider>
  )
}

export function useAppSettings() {
  return useContext(AppSettingsContext)
}
