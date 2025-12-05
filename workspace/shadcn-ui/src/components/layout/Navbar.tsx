import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import {
  Menu,
  X,
  LogOut,
  BarChart3
} from 'lucide-react'
import { cn, resolveUserIdentity } from '@/lib/utils'
import { HatchLogo } from '@/components/HatchLogo'

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const [isAtTop, setIsAtTop] = useState(true)
  const [isLightBehind, setIsLightBehind] = useState(true)
  const { user, signOut, isBroker, session } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const identity = useMemo(() => resolveUserIdentity(session?.profile, user?.email ?? null), [session?.profile, user?.email])
  const fallbackLabel = user?.email ? user.email.split('@')[0] : 'Account'
  const navGreeting = identity.displayName === 'Your Account'
    ? fallbackLabel
    : identity.displayName
  const mobileAccountLabel = identity.displayName === 'Your Account'
    ? fallbackLabel
    : identity.displayName
  const isAuthenticated = Boolean(user)
  const navigation = useMemo(
    () => [
      { name: 'Buy', href: '/?persona=buyer#hero' },
      { name: 'Sell', href: '/?persona=seller#hero' },
      { name: 'Find an Agent', href: '/#agent-match' },
      { name: 'For Pros', href: '/#for-pros' },
    ],
    []
  )

  // Reusable canvas for color conversion (Bug 2 fix)
  const canvasRef = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    return canvas
  }, [])

  // Helper to check if color is transparent (Bug 3 fix)
  const isTransparent = (color: string): boolean => {
    if (color === 'transparent' || color === '') return true
    
    // Check for rgba with 0 alpha
    const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
    if (rgbaMatch) {
      const alpha = rgbaMatch[4]
      // If alpha channel exists and is 0, it's transparent
      if (alpha !== undefined && parseFloat(alpha) === 0) return true
    }
    
    return false
  }

  // Helper function to convert any color format to RGB (Bug 1 & 2 fix)
  const getRGBFromColor = useCallback((color: string): [number, number, number] | null => {
    // Try to parse RGB/RGBA directly first (now handles alpha - Bug 1 fix)
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (rgbMatch) {
      return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])]
    }
    
    // For hex, HSL, named colors, use reusable canvas (Bug 2 fix)
    const ctx = canvasRef.getContext('2d')
    if (!ctx) return null
    
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 1, 1)
    const imageData = ctx.getImageData(0, 0, 1, 1).data
    return [imageData[0], imageData[1], imageData[2]]
  }, [canvasRef])

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY
      setIsAtTop(scrollY < 24)
      
      // Check if there's a light/dark element behind navbar
      // Look BELOW the navbar (after its height + some padding)
      const navHeight = 80 // Navbar is about 64px + padding
      const elementBehind = document.elementFromPoint(window.innerWidth / 2, navHeight)
      
      if (elementBehind) {
        const computedStyle = window.getComputedStyle(elementBehind)
        const bgColor = computedStyle.backgroundColor
        
        // If transparent, check parent
        let actualBgColor = bgColor
        let currentElement: Element | null = elementBehind
        
        // Walk up the DOM tree to find actual background color (Bug 3 fix)
        while (isTransparent(actualBgColor) && currentElement) {
          currentElement = currentElement.parentElement
          if (!currentElement) break
          actualBgColor = window.getComputedStyle(currentElement).backgroundColor
        }
        
        // Only process if we found a valid non-transparent color (Bug 3 fix)
        if (!isTransparent(actualBgColor)) {
          // Convert color to RGB and check brightness
          const rgb = getRGBFromColor(actualBgColor)
          if (rgb) {
            const [r, g, b] = rgb
            const brightness = (r * 299 + g * 587 + b * 114) / 1000
            // Light background = brightness > 128
            setIsLightBehind(brightness > 128)
          }
        }
        // If no valid color found, keep current state (don't change isLightBehind)
      }
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleSignOut = useCallback(async () => {
    await signOut()
    setIsOpen(false)
    navigate('/')
  }, [navigate, signOut])

  const isActive = (path: string) => {
    const [targetPath, targetHashPart] = path.split('#')
    const [basePath, queryString] = targetPath.split('?')
    const personaParam = new URLSearchParams(queryString ?? '').get('persona')

    const samePath = location.pathname === (basePath || path)
    const sameHash = targetHashPart ? location.hash === `#${targetHashPart}` : location.hash === ''
    const samePersona = personaParam ? new URLSearchParams(location.search).get('persona') === personaParam : true

    return samePath && sameHash && samePersona
  }

  const desktopNavClasses = 'hidden md:flex items-center space-x-6'
  const logoWrapperClasses = 'flex items-center'
  const desktopUserClasses = 'hidden md:flex items-center space-x-4'

  const navWrapperClasses = cn(
    'sticky top-0 z-50 transition-colors duration-300',
    isAtTop
      ? 'border-b border-transparent bg-gradient-to-b from-ink-50 via-ink-50 to-brand-green-100/60'
      : 'border-b border-[var(--glass-border)] bg-[var(--glass-background)]/90 backdrop-blur-xl'
  )

  return (
    <nav className={navWrapperClasses}>
      <div className="mx-auto flex max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="relative flex h-16 w-full items-center justify-between">
          {/* Logo */}
          <div className={logoWrapperClasses}>
            <Link to="/" className="flex-shrink-0 flex items-center">
              <HatchLogo className="h-6 md:h-8" />
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className={desktopNavClasses}>
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`rounded-full px-3 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95 ${
                  isActive(item.href)
                    ? 'bg-brand-blue-600/12 text-brand-blue-600'
                    : isLightBehind 
                      ? 'text-ink-800 hover:bg-ink-75 hover:text-ink-900'
                      : 'text-white hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </div>

          {/* User Menu */}
          <div className={desktopUserClasses}>
            {isAuthenticated ? (
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <div className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full font-semibold transition-colors",
                    isLightBehind 
                      ? "bg-brand-blue-600/15 text-brand-blue-600"
                      : "bg-brand-blue-500/20 text-brand-blue-400"
                  )}>
                    {identity.initials}
                  </div>
                  <div className="text-left leading-tight">
                    <div className={cn(
                      "text-sm font-medium transition-colors",
                      isLightBehind ? "text-ink-800" : "text-white"
                    )}>{navGreeting}</div>
                    {user?.email && (
                      <div className={cn(
                        "text-xs transition-colors",
                        isLightBehind ? "text-ink-500" : "text-white/70"
                      )}>{user.email}</div>
                    )}
                  </div>
                </div>
                {isBroker && (
                  <Link to="/broker/dashboard">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className={cn(
                        "shadow-none transition-all duration-200 hover:scale-105 active:scale-95",
                        isLightBehind
                          ? "border-brand-blue-600 bg-white text-brand-blue-600 hover:bg-brand-blue-600/10"
                          : "border-brand-blue-300 bg-transparent text-brand-blue-300 hover:bg-transparent hover:border-brand-blue-200 hover:text-brand-blue-200"
                      )}
                    >
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Dashboard
                    </Button>
                  </Link>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={cn(
                    "transition-all duration-200 hover:scale-105 active:scale-95",
                    isLightBehind 
                      ? "text-ink-600 hover:text-ink-900 hover:bg-ink-75" 
                      : "text-white/90 hover:text-white hover:bg-white/5"
                  )}
                  onClick={handleSignOut}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "transition-all duration-200 hover:scale-105 active:scale-95",
                    isLightBehind 
                      ? "text-ink-600 hover:text-ink-900 hover:bg-ink-75" 
                      : "text-white hover:text-white hover:bg-white/10"
                  )}
                  onClick={() => navigate('/login')}
                >
                  Sign In
                </Button>
                <Button 
                  size="sm" 
                  className="transition-all duration-200 hover:scale-105 active:scale-95"
                  onClick={() => navigate('/register')}
                >
                  Get Started
                </Button>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center ml-auto">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className={cn(
                "inline-flex items-center justify-center rounded-full p-2 transition-all duration-200 hover:scale-110 active:scale-95",
                isLightBehind
                  ? "text-ink-400 hover:bg-ink-75 hover:text-ink-800"
                  : "text-white hover:bg-white/10"
              )}
            >
              {isOpen ? (
                <X className="block h-6 w-6" />
              ) : (
                <Menu className="block h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isOpen && (
        <div className="md:hidden">
          <div className="space-y-2 border-t border-[var(--border-subtle)] bg-[var(--surface-background)] px-4 pt-4 pb-6 shadow-lg">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`block rounded-full px-3 py-2 text-base font-medium transition-all ${
                  isActive(item.href)
                    ? 'bg-brand-blue-600/12 text-brand-blue-600'
                    : 'text-ink-600 hover:bg-ink-75 hover:text-ink-800'
                }`}
                onClick={() => setIsOpen(false)}
              >
                {item.name}
              </Link>
            ))}
            
            {isAuthenticated ? (
              <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
                <div className="flex items-center space-x-3 rounded-[var(--radius-md)] bg-ink-75 px-4 py-2 text-sm text-ink-600">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-blue-600/15 text-brand-blue-600 font-semibold">
                    {identity.initials}
                  </span>
                  <span>{mobileAccountLabel}</span>
                </div>
                {isBroker && (
                  <Link
                    to="/broker/dashboard"
                    className="mt-3 block rounded-full px-3 py-2 text-base font-medium text-ink-600 transition-colors hover:bg-ink-75 hover:text-ink-800"
                    onClick={() => setIsOpen(false)}
                  >
                    <BarChart3 className="mr-2 inline h-4 w-4" />
                    Broker Dashboard
                  </Link>
                )}
                <button
                  onClick={handleSignOut}
                  className="mt-2 block w-full rounded-full px-3 py-2 text-left text-base font-medium text-ink-600 transition-colors hover:bg-ink-75 hover:text-ink-800"
                >
                  <LogOut className="mr-2 inline h-4 w-4" />
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3 border-t border-[var(--border-subtle)] pt-4">
                <Button
                  variant="ghost"
                  className="w-full text-ink-600 hover:text-ink-900"
                  onClick={() => {
                    navigate('/login')
                    setIsOpen(false)
                  }}
                >
                  Sign In
                </Button>
                <Button
                  className="w-full"
                  onClick={() => {
                    navigate('/register')
                    setIsOpen(false)
                  }}
                >
                  Get Started
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
