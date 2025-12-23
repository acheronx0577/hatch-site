import { Navigate, useLocation } from 'react-router-dom'

export default function LeadsRedirect() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const focus = params.get('focus')

  if (focus) {
    params.delete('focus')
    const remaining = params.toString()
    const search = remaining ? `?${remaining}` : ''
    return <Navigate to={`/broker/crm/leads/${encodeURIComponent(focus)}${search}`} replace />
  }

  return <Navigate to={`/broker/crm${location.search}`} replace />
}

