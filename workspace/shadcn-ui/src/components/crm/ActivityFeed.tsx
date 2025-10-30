import { format } from 'date-fns'

interface ActivityItem {
  id: string
  occurredAt: string
  title: string
  description?: string
  actor?: string
}

interface ActivityFeedProps {
  items: ActivityItem[]
  emptyMessage?: string
}

export function ActivityFeed({ items, emptyMessage = 'No activity logged yet.' }: ActivityFeedProps) {
  if (!items.length) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>
  }

  return (
    <ul className="relative space-y-4 before:absolute before:left-3 before:top-0 before:h-full before:border-l before:border-slate-200 before:content-['']">
      {items.map((item) => (
        <li key={item.id} className="relative pl-9">
          <span className="absolute left-[10px] top-2 h-3 w-3 rounded-full border border-brand-200 bg-white" />
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
            <span>{item.title}</span>
            <span>{format(new Date(item.occurredAt), 'PP p')}</span>
          </div>
          {item.actor && <p className="mt-1 text-xs text-slate-500">{item.actor}</p>}
          {item.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.description}</p>
          )}
        </li>
      ))}
    </ul>
  )
}

export type { ActivityItem }

export default ActivityFeed
