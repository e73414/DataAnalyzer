import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { pocketbaseService } from '../services/mcpPocketbaseService'

interface Props {
  fallback: string
  className?: string
}

export default function PageTitle({ fallback, className = 'text-2xl font-bold text-gray-900 dark:text-white' }: Props) {
  const location = useLocation()
  const { data: navLinks } = useQuery({
    queryKey: ['navLinks'],
    queryFn: () => pocketbaseService.getNavLinks(),
    staleTime: 30 * 1000,
  })
  const match = navLinks?.find((link) => link.path === location.pathname)
  let title = fallback
  if (match) {
    const name = match.name
    const colon = name.indexOf(':')
    title = colon !== -1 ? name.slice(colon + 1).trimStart() : name
  }
  return <h1 className={className}>{title}</h1>
}
