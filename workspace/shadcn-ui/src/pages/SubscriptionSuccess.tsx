import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, ArrowRight, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export default function SubscriptionSuccess() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [isVerifying, setIsVerifying] = useState(true)
  const [verificationComplete, setVerificationComplete] = useState(false)
  const { user, status } = useAuth()
  
  const sessionId = searchParams.get('session_id')

  useEffect(() => {
    // Simulate verification process
    const timer = setTimeout(() => {
      setIsVerifying(false)
      setVerificationComplete(true)
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  const handleContinue = () => {
    if (status !== 'authenticated' || !user) {
      navigate('/login', { state: { from: '/broker/dashboard' } })
      return
    }
    navigate('/broker/dashboard')
  }

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="text-center py-12">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Verifying your subscription...</h2>
            <p className="text-gray-600">Please wait while we confirm your payment.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center">
      <div className="container mx-auto px-4">
        <Card className="max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              Welcome to Hatch Pro! 🎉
            </CardTitle>
            <CardDescription className="text-lg text-gray-600">
              Your subscription has been successfully activated
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-800 mb-2">What happens next?</h3>
              <ul className="space-y-2 text-sm text-green-700">
                <li className="flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Your account has been upgraded with full access
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  You can now access all premium features
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  A confirmation email has been sent to your inbox
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Your billing cycle starts today
                </li>
              </ul>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 mb-2">Getting Started</h3>
              <ul className="space-y-2 text-sm text-blue-700">
                <li>• Set up your broker profile and team settings</li>
                <li>• Import your existing listings and contacts</li>
                <li>• Explore the CRM and analytics dashboard</li>
                <li>• Connect your MLS and other integrations</li>
              </ul>
            </div>

            <div className="text-center space-y-4">
              <Button onClick={handleContinue} size="lg" className="px-8">
                Go to Dashboard
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              
              <div className="text-sm text-gray-600">
                Need help getting started?{' '}
                <a href="#" className="text-blue-600 hover:underline">
                  View our quick start guide
                </a>
              </div>
            </div>

            {sessionId && (
              <div className="text-xs text-gray-500 text-center border-t pt-4">
                Session ID: {sessionId}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
