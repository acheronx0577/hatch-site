import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/api/client'
import { useAuth } from './AuthContext'

const STORAGE_KEY = 'customer_portal_preferences'

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `pref_${Math.random().toString(36).slice(2, 10)}`
}

export type SortOption = 'newest' | 'priceLowHigh' | 'priceHighLow' | 'sqft'
export type ViewMode = 'list' | 'map'

export interface CustomerSearchFilters {
  priceMin?: number
  priceMax?: number
  bedrooms?: number
  bathrooms?: number
  propertyTypes?: string[]
  sqftMin?: number
  sqftMax?: number
  yearBuiltMin?: number
  yearBuiltMax?: number
  hasGarage?: boolean
  hasPool?: boolean
}

export interface LeadRequest {
  id: string
  propertyId: string
  propertyAddress: string
  propertyPrice: number | null
  contactName: string
  contactEmail: string
  contactPhone?: string | null
  preferredDate?: string | null
  preferredTime?: string | null
  message?: string | null
  channel: 'schedule' | 'contact'
  createdAt: string
}

export interface SavedSearch {
  id: string
  name: string
  query: string
  filters: CustomerSearchFilters
  sort: SortOption
  viewMode: ViewMode
  notifyEmail: boolean
  notifySms: boolean
  createdAt: string
}

export interface PropertySummary {
  id: string
  slug?: string | null
  address: string
  city?: string | null
  state?: string | null
  zipCode?: string | null
  price?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  sqft?: number | null
  photoUrl?: string | null
  status?: string | null
  propertyType?: string | null
  latitude?: number | null
  longitude?: number | null
  savedAt?: string
  viewedAt?: string
}

export interface CustomerPreferences {
  favorites: Record<string, PropertySummary>
  savedSearches: SavedSearch[]
  recentlyViewed: PropertySummary[]
  leadRequests: LeadRequest[]
  lastAppliedFilters?: {
    query: string
    filters: CustomerSearchFilters
    sort: SortOption
    viewMode: ViewMode
  }
  notificationSettings: {
    emailAlerts: boolean
    smsAlerts: boolean
  }
  version: number
}

interface CustomerExperienceContextValue {
  isLoading: boolean
  isSyncing: boolean
  preferences: CustomerPreferences
  favorites: Array<PropertySummary & { savedAt?: string }>
  savedSearches: SavedSearch[]
  recentlyViewed: PropertySummary[]
  leadRequests: LeadRequest[]
  notificationSettings: CustomerPreferences['notificationSettings']
  lastAppliedFilters?: CustomerPreferences['lastAppliedFilters']
  toggleFavorite: (summary: PropertySummary) => Promise<boolean>
  isFavorite: (propertyId: string) => boolean
  recordView: (summary: PropertySummary) => void
  recordLeadRequest: (payload: Omit<LeadRequest, 'id' | 'createdAt'>) => LeadRequest
  saveSearch: (payload: Omit<SavedSearch, 'id' | 'createdAt'> & { id?: string }) => SavedSearch
  removeSavedSearch: (id: string) => void
  updateNotificationSettings: (settings: Partial<CustomerPreferences['notificationSettings']>) => void
  setLastAppliedFilters: (value: CustomerPreferences['lastAppliedFilters']) => void
  refreshFromRemote: () => Promise<void>
}

const defaultPreferences: CustomerPreferences = {
  favorites: {},
  savedSearches: [],
  recentlyViewed: [],
  leadRequests: [],
  lastAppliedFilters: undefined,
  notificationSettings: {
    emailAlerts: true,
    smsAlerts: false,
  },
  version: 1,
}

const CustomerExperienceContext = createContext<CustomerExperienceContextValue | undefined>(undefined)

const DISABLE_REMOTE_PREFS = import.meta.env.VITE_SUPABASE_DISABLE_REMOTE === 'true'

interface RemoteProfileMetadata {
  customer_portal?: CustomerPreferences
  [key: string]: unknown
}

const normalisePreferences = (input?: CustomerPreferences | null): CustomerPreferences => {
  if (!input) return { ...defaultPreferences }
  return {
    version: typeof input.version === 'number' ? input.version : 1,
    favorites: input.favorites ?? {},
    savedSearches: Array.isArray(input.savedSearches) ? input.savedSearches : [],
    recentlyViewed: Array.isArray(input.recentlyViewed) ? input.recentlyViewed : [],
    leadRequests: Array.isArray(input.leadRequests) ? input.leadRequests : [],
    lastAppliedFilters: input.lastAppliedFilters,
    notificationSettings: {
      emailAlerts: input.notificationSettings?.emailAlerts ?? true,
      smsAlerts: input.notificationSettings?.smsAlerts ?? false,
    },
  }
}

export const CustomerExperienceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userId } = useAuth()
  const [preferences, setPreferences] = useState<CustomerPreferences>(() => {
    if (typeof window === 'undefined') {
      return { ...defaultPreferences }
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as CustomerPreferences
        return normalisePreferences(parsed)
      }
    } catch (error) {
      console.warn('Failed to parse customer preferences from storage', error)
    }
    return { ...defaultPreferences }
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [remoteMetadata, setRemoteMetadata] = useState<RemoteProfileMetadata>({})
  const hasHydratedRemoteRef = useRef(false)
  const syncTimeoutRef = useRef<number | null>(null)
  const policyRecursionRef = useRef(false)

  useEffect(() => {
    hasHydratedRemoteRef.current = false
    policyRecursionRef.current = false
  }, [userId])

  const writeToStorage = useCallback((next: CustomerPreferences) => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch (error) {
      console.warn('Failed to persist customer preferences locally', error)
    }
  }, [])

  const hydrateFromRemote = useCallback(async () => {
    if (!userId) {
      setIsLoading(false)
      return
    }

    if (DISABLE_REMOTE_PREFS) {
      setIsLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('metadata')
        .eq('id', userId)
        .maybeSingle()

      if (error) throw error

      const metadata = (data?.metadata as RemoteProfileMetadata | null) ?? {}
      setRemoteMetadata(metadata)

      const remotePrefs = normalisePreferences(metadata.customer_portal as CustomerPreferences | undefined)

      // Merge with any locally stored guest preferences so users retain selections after login.
      let merged = remotePrefs
      if (remotePrefs.recentlyViewed.length < preferences.recentlyViewed.length || Object.keys(remotePrefs.favorites).length === 0) {
        const leadSet = new Set<string>()
        const mergedLeads = [...remotePrefs.leadRequests, ...preferences.leadRequests]
          .reduce<LeadRequest[]>((acc, request) => {
            if (!leadSet.has(request.id)) {
              leadSet.add(request.id)
              acc.push(request)
            }
            return acc
          }, [])
          .slice(0, 50)

        merged = {
          ...remotePrefs,
          favorites: { ...remotePrefs.favorites, ...preferences.favorites },
          recentlyViewed: [...preferences.recentlyViewed, ...remotePrefs.recentlyViewed]
            .reduce<PropertySummary[]>((acc, item) => {
              if (!acc.find((existing) => existing.id === item.id)) {
                acc.push(item)
              }
              return acc
            }, [])
            .slice(0, 50),
          savedSearches: remotePrefs.savedSearches.length >= preferences.savedSearches.length
            ? remotePrefs.savedSearches
            : preferences.savedSearches,
          leadRequests: mergedLeads,
        }
      }

      setPreferences(merged)
      hasHydratedRemoteRef.current = true
      writeToStorage(merged)
    } catch (error) {
      const errorCode = (error as { code?: string })?.code
      const errorMessage = error instanceof Error ? error.message : undefined
      if (errorCode === '42P17' || (errorMessage && errorMessage.includes('42P17'))) {
        console.warn('Customer preferences remote hydration skipped due to policy recursion', error)
        policyRecursionRef.current = true
        setRemoteMetadata({})
        hasHydratedRemoteRef.current = true
        writeToStorage(preferences)
      } else {
        console.error('Failed to hydrate customer preferences from Supabase', error)
      }
    } finally {
      setIsLoading(false)
    }
  }, [preferences.favorites, preferences.recentlyViewed, preferences.savedSearches, preferences.leadRequests, userId, writeToStorage])

  useEffect(() => {
    if (!userId) {
      setIsLoading(false)
      return
    }
    void hydrateFromRemote()
  }, [hydrateFromRemote, userId])

  useEffect(() => {
    if (userId) return
    writeToStorage(preferences)
  }, [preferences, userId, writeToStorage])

  const syncToRemote = useCallback(async (next: CustomerPreferences) => {
    if (!userId || policyRecursionRef.current) return
    try {
      setIsSyncing(true)
      const updatedMetadata: RemoteProfileMetadata = {
        ...remoteMetadata,
        customer_portal: next,
      }

      const { error } = await supabase
        .from('profiles')
        .update({ metadata: updatedMetadata })
        .eq('id', userId)

      if (error) throw error

      setRemoteMetadata(updatedMetadata)
      writeToStorage(next)
    } catch (error) {
      const errorCode = (error as { code?: string })?.code
      const errorMessage = error instanceof Error ? error.message : undefined
      if (errorCode === '42P17' || (errorMessage && errorMessage.includes('42P17'))) {
        policyRecursionRef.current = true
        console.warn('Skipping customer preference sync due to policy recursion', error)
      } else {
        console.error('Failed to sync customer preferences to Supabase', error)
      }
    } finally {
      setIsSyncing(false)
    }
  }, [remoteMetadata, userId, writeToStorage])

  useEffect(() => {
    if (!userId) return
    if (!hasHydratedRemoteRef.current) return

    if (syncTimeoutRef.current) {
      window.clearTimeout(syncTimeoutRef.current)
    }

    syncTimeoutRef.current = window.setTimeout(() => {
      void syncToRemote(preferences)
    }, 800)

    return () => {
      if (syncTimeoutRef.current) {
        window.clearTimeout(syncTimeoutRef.current)
        syncTimeoutRef.current = null
      }
    }
  }, [preferences, userId, syncToRemote])

  const toggleFavorite = useCallback(async (summary: PropertySummary) => {
    setPreferences((prev) => {
      const exists = Boolean(prev.favorites[summary.id])
      const nextFavorites = { ...prev.favorites }
      if (exists) {
        delete nextFavorites[summary.id]
      } else {
        nextFavorites[summary.id] = {
          ...summary,
          savedAt: new Date().toISOString(),
        }
      }
      const next: CustomerPreferences = {
        ...prev,
        favorites: nextFavorites,
      }
      writeToStorage(next)
      return next
    })
    return true
  }, [writeToStorage])

  const isFavorite = useCallback((propertyId: string) => Boolean(preferences.favorites[propertyId]), [preferences.favorites])

  const recordLeadRequest = useCallback((payload: Omit<LeadRequest, 'id' | 'createdAt'>) => {
    const entry: LeadRequest = {
      ...payload,
      id: createId(),
      createdAt: new Date().toISOString(),
    }

    setPreferences((prev) => {
      const next: CustomerPreferences = {
        ...prev,
        leadRequests: [entry, ...prev.leadRequests].slice(0, 50),
      }
      writeToStorage(next)
      return next
    })

    return entry
  }, [writeToStorage])

  const recordView = useCallback((summary: PropertySummary) => {
    setPreferences((prev) => {
      const filtered = prev.recentlyViewed.filter((item) => item.id !== summary.id)
      const nextRecent = [{ ...summary, viewedAt: new Date().toISOString() }, ...filtered].slice(0, 50)
      const next: CustomerPreferences = {
        ...prev,
        recentlyViewed: nextRecent,
      }
      writeToStorage(next)
      return next
    })
  }, [writeToStorage])

  const saveSearch = useCallback((payload: Omit<SavedSearch, 'id' | 'createdAt'> & { id?: string }) => {
    const newId = payload.id ?? createId()
    const now = new Date().toISOString()

    setPreferences((prev) => {
      const existingIndex = prev.savedSearches.findIndex((search) => search.id === newId)
      const nextSaved = [...prev.savedSearches]

      const entry: SavedSearch = {
        id: newId,
        name: payload.name,
        query: payload.query,
        filters: payload.filters,
        sort: payload.sort,
        viewMode: payload.viewMode,
        notifyEmail: payload.notifyEmail,
        notifySms: payload.notifySms,
        createdAt: existingIndex >= 0 ? prev.savedSearches[existingIndex].createdAt : now,
      }

      if (existingIndex >= 0) {
        nextSaved[existingIndex] = entry
      } else {
        nextSaved.unshift(entry)
      }

      const next: CustomerPreferences = {
        ...prev,
        savedSearches: nextSaved.slice(0, 20),
      }
      writeToStorage(next)
      return next
    })

    return {
      id: newId,
      name: payload.name,
      query: payload.query,
      filters: payload.filters,
      sort: payload.sort,
      viewMode: payload.viewMode,
      notifyEmail: payload.notifyEmail,
      notifySms: payload.notifySms,
      createdAt: new Date().toISOString(),
    }
  }, [writeToStorage])

  const removeSavedSearch = useCallback((id: string) => {
    setPreferences((prev) => {
      const nextSaved = prev.savedSearches.filter((search) => search.id !== id)
      const next: CustomerPreferences = { ...prev, savedSearches: nextSaved }
      writeToStorage(next)
      return next
    })
  }, [writeToStorage])

  const updateNotificationSettings = useCallback((settings: Partial<CustomerPreferences['notificationSettings']>) => {
    setPreferences((prev) => {
      const next: CustomerPreferences = {
        ...prev,
        notificationSettings: {
          ...prev.notificationSettings,
          ...settings,
        },
      }
      writeToStorage(next)
      return next
    })
  }, [writeToStorage])

  const setLastAppliedFilters = useCallback((value: CustomerPreferences['lastAppliedFilters']) => {
    setPreferences((prev) => {
      const next: CustomerPreferences = {
        ...prev,
        lastAppliedFilters: value,
      }
      writeToStorage(next)
      return next
    })
  }, [writeToStorage])

  const refreshFromRemote = useCallback(async () => {
    if (!userId) return
    setIsLoading(true)
    await hydrateFromRemote()
  }, [hydrateFromRemote, userId])

  const value: CustomerExperienceContextValue = useMemo(() => ({
    isLoading,
    isSyncing,
    preferences,
    favorites: Object.values(preferences.favorites)
      .sort((a, b) => {
        if (a.savedAt && b.savedAt) return b.savedAt.localeCompare(a.savedAt)
        return 0
      }),
    savedSearches: preferences.savedSearches,
    recentlyViewed: preferences.recentlyViewed,
    leadRequests: preferences.leadRequests,
    notificationSettings: preferences.notificationSettings,
    lastAppliedFilters: preferences.lastAppliedFilters,
    toggleFavorite,
    isFavorite,
    recordView,
    recordLeadRequest,
    saveSearch,
    removeSavedSearch,
    updateNotificationSettings,
    setLastAppliedFilters,
    refreshFromRemote,
  }), [
    isLoading,
    isSyncing,
    preferences,
    toggleFavorite,
    isFavorite,
    recordView,
    recordLeadRequest,
    saveSearch,
    removeSavedSearch,
    updateNotificationSettings,
    setLastAppliedFilters,
    refreshFromRemote,
  ])

  return (
    <CustomerExperienceContext.Provider value={value}>
      {children}
    </CustomerExperienceContext.Provider>
  )
}

export const useCustomerExperience = () => {
  const context = useContext(CustomerExperienceContext)
  if (!context) {
    throw new Error('useCustomerExperience must be used within CustomerExperienceProvider')
  }
  return context
}
