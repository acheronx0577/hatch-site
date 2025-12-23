import { useCallback } from 'react'
import { inject } from '@vercel/analytics'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { setCookieConsent, type CookieConsentChoice } from '@/lib/cookieConsent'
import { useCookieConsent } from '@/lib/hooks/useCookieConsent'

let vercelAnalyticsInjected = false

function ensureVercelAnalytics() {
  if (vercelAnalyticsInjected) return
  vercelAnalyticsInjected = true
  try {
    inject()
  } catch {
    // ignore
  }
}

export function CookieConsentBanner() {
  const consent = useCookieConsent()

  const handleChoice = useCallback((choice: CookieConsentChoice) => {
    setCookieConsent(choice)
    if (choice === 'all') {
      ensureVercelAnalytics()
    }
  }, [])

  if (consent) return null

  return (
    <>
      <div className="fixed bottom-4 left-4 right-4 z-[55] sm:right-auto sm:max-w-md">
        <Card className="hover:translate-y-0">
          <Button
            type="button"
            aria-label="Close cookie banner"
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 h-8 w-8"
            onClick={() => handleChoice('essential')}
          >
            <X className="h-4 w-4" />
          </Button>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cookies</CardTitle>
          <CardDescription>
            We use essential cookies to make our site work. With your consent, we may also use non-essential cookies to
            improve user experience, personalize content, and analyze website traffic. For these reasons, we may share
            your site usage data with our analytics partners. By clicking “Accept,” you agree to our website&apos;s
            cookie use as described in our{' '}
            <a href="/terms" className="underline underline-offset-2">
              Cookie Policy
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex items-center justify-end">
          <Button size="sm" onClick={() => handleChoice('all')}>
            Accept
          </Button>
        </CardFooter>
      </Card>
      </div>
    </>
  )
}
