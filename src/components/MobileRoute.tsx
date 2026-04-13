import { Suspense } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-200 dark:bg-gray-950">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
    </div>
  )
}

interface MobileRouteProps {
  desktop: React.ComponentType
  mobile: React.LazyExoticComponent<React.ComponentType>
}

export default function MobileRoute({ desktop: Desktop, mobile: Mobile }: MobileRouteProps) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <Mobile />
      </Suspense>
    )
  }
  return <Desktop />
}
