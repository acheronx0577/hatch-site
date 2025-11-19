import { useState, useCallback } from 'react'

export interface PaginationState {
  page: number
  pageSize: number
  total: number
}

export function usePagination(initialPageSize: number = 10) {
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: initialPageSize,
    total: 0
  })

  const setPage = useCallback((page: number) => {
    setPagination(prev => ({ ...prev, page }))
  }, [])

  const setPageSize = useCallback((pageSize: number) => {
    setPagination(prev => ({ ...prev, pageSize, page: 1 }))
  }, [])

  const setTotal = useCallback((total: number) => {
    setPagination(prev => ({ ...prev, total }))
  }, [])

  const nextPage = useCallback(() => {
    setPagination(prev => {
      const maxPage = Math.ceil(prev.total / prev.pageSize)
      return { ...prev, page: Math.min(prev.page + 1, maxPage) }
    })
  }, [])

  const previousPage = useCallback(() => {
    setPagination(prev => ({
      ...prev,
      page: Math.max(prev.page - 1, 1)
    }))
  }, [])

  const totalPages = Math.ceil(pagination.total / pagination.pageSize)
  const hasNextPage = pagination.page < totalPages
  const hasPreviousPage = pagination.page > 1

  return {
    pagination,
    setPage,
    setPageSize,
    setTotal,
    nextPage,
    previousPage,
    totalPages,
    hasNextPage,
    hasPreviousPage
  }
}
