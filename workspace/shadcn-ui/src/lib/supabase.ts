import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey)

const disabledError = new Error('Supabase disabled (no env configured)')
const disabledPromise = async () => ({ data: null, error: disabledError })
const disabledFrom = () => ({
  select: disabledPromise,
  insert: disabledPromise,
  update: disabledPromise,
  delete: disabledPromise,
  upsert: disabledPromise,
  eq: () => disabledFrom(),
  single: disabledPromise,
})
const disabledStorage = {
  from: () => ({
    upload: disabledPromise,
    remove: disabledPromise,
    getPublicUrl: () => ({ data: null, error: disabledError }),
    createSignedUrl: disabledPromise,
  }),
}
const disabledAuth = {
  signInWithPassword: disabledPromise,
  signUp: disabledPromise,
  signOut: disabledPromise,
  setSession: disabledPromise,
  updateUser: disabledPromise,
  getSession: async () => ({ data: { session: null }, error: null }),
  getUser: async () => ({ data: { user: null }, error: null }),
  onAuthStateChange: () => ({
    data: { subscription: { unsubscribe() {} } },
    error: null,
  }),
}

export const supabase =
  supabaseEnabled && supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : ({
        auth: disabledAuth,
        from: disabledFrom,
        storage: disabledStorage,
        rpc: disabledPromise,
      } as any)

export const supabaseAnonKey = supabaseEnabled && supabaseAnonKey ? supabaseAnonKey : ''

// Auth helpers
export const getUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export const getProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('Profile')
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
