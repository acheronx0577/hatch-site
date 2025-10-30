import React, { useMemo } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import BrokerSidebar from './BrokerSidebar'
import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { resolveUserIdentity } from '@/lib/utils'
import { HatchLogo } from '@/components/HatchLogo'

interface BrokerLayoutProps {
  showBackButton?: boolean
}

export default function BrokerLayout({ showBackButton = false }: BrokerLayoutProps) {
  const navigate = useNavigate()
  const { session, user } = useAuth()

  const { displayName, initials } = useMemo(
    () => resolveUserIdentity(session?.profile, user?.email ?? null, 'Broker'),
    [session?.profile, user?.email]
  )

  return (
    <div className="flex h-screen bg-gray-100">
      <BrokerSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm border-b px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <HatchLogo className="h-12 md:h-16" />
              <span className="ml-3 text-xl font-semibold text-gray-900">Broker Portal</span>
            </div>
            
            {/* Public Site Navigation */}
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                onClick={() => navigate('/')}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 border-gray-300"
              >
                <ExternalLink className="h-4 w-4" />
                <span>View Public Site</span>
              </Button>
              
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-medium">{initials}</span>
                </div>
                <span className="text-gray-700 font-medium">{displayName}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
