import { useState, useCallback } from 'react'

export interface SortConfig<T = string> {
  field: T
  direction: 'asc' | 'desc'
}

export function useSort<T = string>(initialField?: T, initialDirection: 'asc' | 'desc' = 'asc') {
  const [sortConfig, setSortConfig] = useState<SortConfig<T> | null>(
    initialField ? { field: initialField, direction: initialDirection } : null
  )

  const toggleSort = useCallback((field: T) => {
    setSortConfig(current => {
      if (!current || current.field !== field) {
        return { field, direction: 'asc' }
      }
      if (current.direction === 'asc') {
        return { field, direction: 'desc' }
      }
      return null
    })
  }, [])

  const setSort = useCallback((field: T, direction: 'asc' | 'desc') => {
    setSortConfig({ field, direction })
  }, [])

  const clearSort = useCallback(() => {
    setSortConfig(null)
  }, [])

  return {
    sortConfig,
    toggleSort,
    setSort,
    clearSort
  }
}
