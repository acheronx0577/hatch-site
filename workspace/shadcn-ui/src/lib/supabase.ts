import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rdakjayhdvewbpguyuiv.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkYWtqYXloZHZld2JwZ3V5dWl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMTAxODAsImV4cCI6MjA3NDU4NjE4MH0.Fhy_UCtPfNcIvRYTt6BdSQLos5snjW56l6HPm97HU28'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Auth helpers
export const getUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export const getProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  
  if (error) throw error
  return data
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
