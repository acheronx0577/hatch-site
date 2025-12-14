'use client'

import React, { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Alert, AlertDescription } from '../ui/alert'
import { Glasses, Loader2 } from 'lucide-react'
import { getRedirectUrl } from '../../utils/url'
import { PasswordResetModal } from './PasswordResetModal'
import { login, registerConsumer } from '../../lib/api/auth'
import { useAuth } from '../../contexts/AuthContext'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  defaultView?: 'sign_in' | 'sign_up'
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  defaultView = 'sign_in'
}) => {
  const { refresh } = useAuth()
  const [view, setView] = useState<'sign_in' | 'sign_up'>(defaultView)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [passwordResetModalOpen, setPasswordResetModalOpen] = useState(false)

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)
    setShowForgotPassword(false)

    try {
      if (view === 'sign_up') {
        // Use backend API for registration
        const response = await registerConsumer({
          email,
          password,
          firstName,
          lastName
        })

        // Store tokens in localStorage
        localStorage.setItem('accessToken', response.accessToken)
        localStorage.setItem('refreshToken', response.refreshToken)

        // Refresh auth context to pick up the new session
        await refresh()
        onClose()
      } else {
        console.log('[AuthModal] signing in with password', { email })

        // Use backend API for login
        const response = await login({
          email,
          password
        })

        console.log('[AuthModal] login result', { response })

        // Store tokens in localStorage
        localStorage.setItem('accessToken', response.accessToken)
        localStorage.setItem('refreshToken', response.refreshToken)

        // Refresh auth context to pick up the new session
        await refresh()
        onClose()
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      if (errorMessage.toLowerCase().includes('invalid') ||
          errorMessage.toLowerCase().includes('password') ||
          errorMessage.toLowerCase().includes('credentials')) {
        setShowForgotPassword(true)
      }
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getRedirectUrl('/auth/callback')
        }
      })
      
      if (error) throw error
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      setError(errorMessage)
      setLoading(false)
    }
  }

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setFirstName('')
    setLastName('')
    setError(null)
    setMessage(null)
    setShowForgotPassword(false)
  }

  const switchView = (newView: 'sign_in' | 'sign_up') => {
    setView(newView)
    resetForm()
  }

  const handleForgotPasswordClick = () => {
    setPasswordResetModalOpen(true)
  }

  const handlePasswordResetClose = () => {
    setPasswordResetModalOpen(false)
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">
              {view === 'sign_in' ? 'Welcome Back' : 'Create Account'}
            </DialogTitle>
          </DialogHeader>
          
          <Tabs value={view} onValueChange={switchView}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="sign_in">Sign In</TabsTrigger>
              <TabsTrigger value="sign_up">Sign Up</TabsTrigger>
            </TabsList>
            
            <div className="space-y-4 mt-4">
              {/* OAuth Buttons */}
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleOAuthSignIn('google')}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  )}
                  Continue with Google
                </Button>
                
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleOAuthSignIn('github')}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Glasses className="w-4 h-4 mr-2" />
                  )}
                  Continue with Glass
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or continue with email
                  </span>
                </div>
              </div>

              {/* Email Form */}
              <form onSubmit={handleEmailAuth} className="space-y-4">
                {view === 'sign_up' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                )}
                
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  
                  {/* Show forgot password link when login fails */}
                  {view === 'sign_in' && showForgotPassword && (
                    <div className="mt-2">
                      <Button
                        type="button"
                        variant="link"
                        className="p-0 h-auto text-sm text-primary hover:underline"
                        onClick={handleForgotPasswordClick}
                      >
                        Forgot your password?
                      </Button>
                    </div>
                  )}
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {message && (
                  <Alert>
                    <AlertDescription>{message}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {view === 'sign_in' ? 'Sign In' : 'Create Account'}
                </Button>
              </form>

              {/* Always show forgot password link for sign in view */}
              {view === 'sign_in' && !showForgotPassword && (
                <div className="text-center">
                  <Button
                    type="button"
                    variant="link"
                    className="text-sm text-muted-foreground hover:text-primary"
                    onClick={handleForgotPasswordClick}
                  >
                    Forgot your password?
                  </Button>
                </div>
              )}
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* New Password Reset Modal */}
      <PasswordResetModal
        isOpen={passwordResetModalOpen}
        onClose={handlePasswordResetClose}
        initialEmail={email}
      />
    </>
  )
}
