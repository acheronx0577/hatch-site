import { supabase } from '../lib/supabase'

/**
 * Emergency admin system with comprehensive error handling and logging
 */

// Emergency admin setup using browser localStorage
export const setEmergencyAdmin = (email: string) => {
  try {
    console.log('🚀 Setting emergency admin for:', email)
    localStorage.setItem('hatch_emergency_admin', email)
    localStorage.setItem('hatch_admin_timestamp', Date.now().toString())
    console.log('✅ Emergency admin privileges granted to:', email)
    
    // Verify it was set
    const stored = localStorage.getItem('hatch_emergency_admin')
    console.log('📦 Stored admin email:', stored)
    
    return { success: true, email: stored }
  } catch (error) {
    console.error('❌ Failed to set emergency admin:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Check if user has emergency admin privileges
export const isEmergencyAdmin = (userEmail?: string) => {
  try {
    const adminEmail = localStorage.getItem('hatch_emergency_admin')
    const timestamp = localStorage.getItem('hatch_admin_timestamp')
    
    console.log('🔍 Checking emergency admin status:', { adminEmail, timestamp, userEmail })
    
    if (!adminEmail || !timestamp) {
      console.log('❌ No emergency admin data found')
      return false
    }
    
    // Check if admin privileges are still valid (24 hours)
    const adminTime = parseInt(timestamp)
    const now = Date.now()
    const twentyFourHours = 24 * 60 * 60 * 1000
    
    if (now - adminTime > twentyFourHours) {
      console.log('⏰ Emergency admin privileges expired')
      localStorage.removeItem('hatch_emergency_admin')
      localStorage.removeItem('hatch_admin_timestamp')
      return false
    }
    
    const isAdmin = userEmail ? adminEmail === userEmail : true
    console.log('✅ Emergency admin check result:', isAdmin)
    return isAdmin
  } catch (error) {
    console.error('❌ Error checking emergency admin:', error)
    return false
  }
}

// Simple auth-only admin creation (no database required)
export const createAuthOnlyAdmin = async (email: string, password: string) => {
  try {
    console.log('🚀 Creating auth-only admin account for:', email)
    
    // Try to sign in first
    console.log('🔐 Attempting sign in...')
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    
    if (signInData.user) {
      console.log('✅ User signed in successfully:', signInData.user.id)
      // Set emergency admin privileges
      const adminResult = setEmergencyAdmin(email)
      console.log('👑 Admin privileges result:', adminResult)
      
      return {
        success: true,
        message: 'Admin privileges granted! You can now access /admin',
        method: 'existing_user',
        userId: signInData.user.id
      }
    }
    
    console.log('👤 Sign in failed, creating new user...')
    console.log('Sign in error:', signInError)
    
    // Create new user if sign in failed
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: 'admin',
          first_name: 'Admin',
          last_name: 'User'
        }
      }
    })
    
    if (signUpError) {
      console.error('❌ Sign up error:', signUpError)
      throw signUpError
    }
    
    if (signUpData.user) {
      console.log('✅ New user created:', signUpData.user.id)
      
      // Set emergency admin privileges
      const adminResult = setEmergencyAdmin(email)
      console.log('👑 Admin privileges result:', adminResult)
      
      // Try to sign in the new user
      console.log('🔐 Signing in new user...')
      const { data: newSignIn, error: newSignInError } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      
      if (newSignInError) {
        console.log('⚠️ New user sign in failed:', newSignInError)
        // Still return success since admin privileges are set
      }
      
      return {
        success: true,
        message: 'Admin account created and privileges granted! You can now access /admin',
        method: 'new_user',
        userId: signUpData.user.id
      }
    }
    
    throw new Error('Failed to create user account - no user returned')
    
  } catch (error) {
    console.error('❌ Auth-only admin creation failed:', error)
    return {
      success: false,
      message: 'Failed to create admin account',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// Console helper functions with better error handling
export const setupConsoleHelpers = () => {
  if (typeof window === 'undefined') return
  
  try {
    // Emergency admin setup
    (window as Record<string, unknown>).makeAdmin = (email: string) => {
      console.log('🚨 CONSOLE: Making admin for:', email)
      const result = setEmergencyAdmin(email)
      console.log('🚨 CONSOLE: Result:', result)
      
      if (result.success) {
        console.log('✅ CONSOLE: Emergency admin privileges granted!')
        console.log('🚀 CONSOLE: Navigate to /admin to access the admin panel')
        
        // Force page reload to update auth context
        setTimeout(() => {
          console.log('🔄 CONSOLE: Reloading page to update auth context...')
          window.location.reload()
        }, 1000)
      }
      
      return result
    }
    
    // Quick admin creation
    (window as Record<string, unknown>).quickAdmin = async (email: string, password: string) => {
      console.log('🚨 CONSOLE: Quick admin setup for:', email)
      const result = await createAuthOnlyAdmin(email, password)
      console.log('🚨 CONSOLE: Admin creation result:', result)
      
      if (result.success) {
        console.log('🎉 CONSOLE: Success! Navigating to /admin in 2 seconds...')
        setTimeout(() => {
          window.location.href = '/admin'
        }, 2000)
      }
      
      return result
    }
    
    // Check admin status
    (window as Record<string, unknown>).checkAdmin = () => {
      const adminEmail = localStorage.getItem('hatch_emergency_admin')
      const isAdmin = isEmergencyAdmin()
      const result = { isAdmin, adminEmail }
      console.log('🚨 CONSOLE: Admin status:', result)
      return result
    }
    
    // Force admin (nuclear option)
    (window as Record<string, unknown>).forceAdmin = (email: string) => {
      console.log('💥 CONSOLE: FORCE ADMIN for:', email)
      localStorage.setItem('hatch_emergency_admin', email)
      localStorage.setItem('hatch_admin_timestamp', Date.now().toString())
      localStorage.setItem('hatch_force_admin', 'true')
      console.log('💥 CONSOLE: Force admin set! Reloading page...')
      window.location.reload()
    }
    
    console.log('🔧 Emergency admin helpers loaded successfully!')
    console.log('📋 Available commands:')
    console.log('  makeAdmin("email") - Grant immediate admin access')
    console.log('  quickAdmin("email", "password") - Create account + admin access')
    console.log('  checkAdmin() - Check current admin status')
    console.log('  forceAdmin("email") - Nuclear option - force admin access')
    console.log('')
    console.log('🚨 QUICK START: makeAdmin("apexsquad7@gmail.com")')
    
  } catch (error) {
    console.error('❌ Failed to setup console helpers:', error)
  }
}

// Initialize console helpers immediately
setupConsoleHelpers()
