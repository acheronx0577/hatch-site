import { useState, useCallback, useMemo } from 'react'

export interface FilterConfig<T> {
  [key: string]: any
}

export function useFilters<T extends Record<string, any>>(initialFilters?: Partial<T>) {
  const [filters, setFilters] = useState<Partial<T>>(initialFilters || {})

  const updateFilter = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }, [])

  const updateFilters = useCallback((newFilters: Partial<T>) => {
    setFilters(prev => ({ ...prev, ...newFilters }))
  }, [])

  const clearFilter = useCallback(<K extends keyof T>(key: K) => {
    setFilters(prev => {
      const { [key]: _, ...rest } = prev
      return rest
    })
  }, [])

  const clearAllFilters = useCallback(() => {
    setFilters({})
  }, [])

  const hasActiveFilters = useMemo(() => {
    return Object.keys(filters).length > 0
  }, [filters])

  const activeFilterCount = useMemo(() => {
    return Object.keys(filters).length
  }, [filters])

  return {
    filters,
    updateFilter,
    updateFilters,
    clearFilter,
    clearAllFilters,
    hasActiveFilters,
    activeFilterCount,
    setFilters
  }
}
