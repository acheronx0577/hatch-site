import { useEffect, useMemo, useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths
} from 'date-fns'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Plus,
  Trash2,
  Users
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/use-toast'
import {
  CalendarEventRecord,
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent
} from '@/lib/api/hatch'
import { cn } from '@/lib/utils'

const TENANT_ID = import.meta.env.VITE_TENANT_ID || 'tenant-hatch'

const typeOptions = [
  { label: 'Meeting', value: 'MEETING' },
  { label: 'Property Showing', value: 'SHOWING' },
  { label: 'Inspection', value: 'INSPECTION' },
  { label: 'Closing', value: 'CLOSING' },
  { label: 'Follow Up', value: 'FOLLOW_UP' },
  { label: 'Marketing', value: 'MARKETING' },
  { label: 'Other', value: 'OTHER' }
]

const eventTypeLabel = (value: CalendarEventRecord['eventType']) =>
  typeOptions.find((option) => option.value === value)?.label ?? value.toLowerCase()

const typeBadgeVariant = (value: CalendarEventRecord['eventType']) => {
  switch (value) {
    case 'SHOWING':
      return 'bg-blue-100 text-blue-800'
    case 'MEETING':
      return 'bg-green-100 text-green-800'
    case 'INSPECTION':
      return 'bg-purple-100 text-purple-800'
    case 'CLOSING':
      return 'bg-orange-100 text-orange-800'
    case 'FOLLOW_UP':
      return 'bg-amber-100 text-amber-800'
    case 'MARKETING':
      return 'bg-pink-100 text-pink-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

const priorityLabel = (value: CalendarEventRecord['priority']) => {
  switch (value) {
    case 'HIGH':
      return 'High'
    case 'LOW':
      return 'Low'
    default:
      return 'Medium'
  }
}

const statusBadgeVariant = (value: CalendarEventRecord['status']) => {
  switch (value) {
    case 'CONFIRMED':
      return 'bg-green-100 text-green-800'
    case 'COMPLETED':
      return 'bg-blue-100 text-blue-800'
    case 'CANCELLED':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-amber-100 text-amber-800'
  }
}

const eventTypeIndicatorClasses: Record<CalendarEventRecord['eventType'], string> = {
  SHOWING: 'bg-blue-500',
  MEETING: 'bg-green-500',
  INSPECTION: 'bg-purple-500',
  CLOSING: 'bg-orange-500',
  FOLLOW_UP: 'bg-amber-500',
  MARKETING: 'bg-pink-500',
  OTHER: 'bg-slate-400'
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

interface EventFormState {
  id?: string
  title: string
  type: CalendarEventRecord['eventType']
  date: string
  startTime: string
  endTime: string
  location: string
  clientNotes: string
  status: CalendarEventRecord['status']
  priority: CalendarEventRecord['priority']
}

const emptyFormState = (baseDate?: Date): EventFormState => {
  const now = new Date(baseDate ?? Date.now())
  if (baseDate) {
    now.setHours(9, 0, 0, 0)
  } else {
    now.setSeconds(0, 0)
  }
  const end = new Date(now.getTime() + 60 * 60 * 1000)

  return {
    title: '',
    type: 'MEETING',
    date: format(now, 'yyyy-MM-dd'),
    startTime: format(now, 'HH:mm'),
    endTime: format(end, 'HH:mm'),
    location: '',
    clientNotes: '',
    status: 'PENDING',
    priority: 'MEDIUM'
  }
}

const toFormState = (event: CalendarEventRecord): EventFormState => {
  const start = parseISO(event.startAt)
  const end = parseISO(event.endAt)
  return {
    id: event.id,
    title: event.title,
    type: event.eventType,
    date: format(start, 'yyyy-MM-dd'),
    startTime: format(start, 'HH:mm'),
    endTime: format(end, 'HH:mm'),
    location: event.location ?? '',
    clientNotes: event.notes ?? '',
    status: event.status,
    priority: event.priority
  }
}

const formatTimeRange = (startISO: string, endISO: string) => {
  const start = parseISO(startISO)
  const end = parseISO(endISO)
  return `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`
}

const buildCalendarWeeks = (month: Date) => {
  const start = startOfWeek(startOfMonth(month))
  const end = endOfWeek(endOfMonth(month))
  const days = eachDayOfInterval({ start, end })

  const weeks: Date[][] = []
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7))
  }
  return weeks
}

const CalendarPage = () => {
  const [events, setEvents] = useState<CalendarEventRecord[]>([])
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formState, setFormState] = useState<EventFormState>(() => emptyFormState())
  const [isSaving, setIsSaving] = useState(false)

  const loadEvents = async () => {
    try {
      setIsLoading(true)
      const start = new Date()
      start.setMonth(start.getMonth() - 1)
      const end = new Date()
      end.setMonth(end.getMonth() + 2)
      const data = await listCalendarEvents(TENANT_ID, {
        start: start.toISOString(),
        end: end.toISOString()
      })
      setEvents(data)
    } catch (error) {
      console.error(error)
      toast({
        title: 'Unable to load events',
        description: error instanceof Error ? error.message : 'Unexpected error fetching calendar events',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadEvents()
  }, [])

  const openCreateDialog = () => {
    setFormState(emptyFormState(selectedDate))
    setDialogOpen(true)
  }

  const handleEdit = (event: CalendarEventRecord) => {
    const eventDate = parseISO(event.startAt)
    setSelectedDate(eventDate)
    setCurrentMonth(startOfMonth(eventDate))
    setFormState(toFormState(event))
    setDialogOpen(true)
  }

  const handleSelectDate = (day: Date) => {
    setSelectedDate(day)
    setCurrentMonth(startOfMonth(day))
  }

  const handleDelete = async (eventId: string) => {
    try {
      await deleteCalendarEvent(eventId)
      setEvents((prev) => prev.filter((event) => event.id !== eventId))
      toast({ title: 'Event removed' })
    } catch (error) {
      toast({
        title: 'Failed to delete event',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      })
    }
  }

  const handleSubmit = async () => {
    if (!formState.title.trim()) {
      toast({ title: 'Title required', description: 'Please provide a title for the event', variant: 'destructive' })
      return
    }

    setIsSaving(true)
    try {
      const start = new Date(`${formState.date}T${formState.startTime}`)
      const end = new Date(`${formState.date}T${formState.endTime}`)
      if (end <= start) {
        toast({
          title: 'Invalid time range',
          description: 'End time must be after start time',
          variant: 'destructive'
        })
        return
      }

      const payload = {
        tenantId: TENANT_ID,
        title: formState.title,
        eventType: formState.type,
        status: formState.status,
        priority: formState.priority,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        location: formState.location || undefined,
        notes: formState.clientNotes || undefined
      }

      if (formState.id) {
        const updated = await updateCalendarEvent(formState.id, payload)
        setEvents((prev) => prev.map((event) => (event.id === updated.id ? updated : event)))
        toast({ title: 'Event updated' })
      } else {
        const created = await createCalendarEvent(payload)
        setEvents((prev) => [...prev, created])
        toast({ title: 'Event scheduled' })
      }

      setSelectedDate(start)
      setCurrentMonth(startOfMonth(start))
      setDialogOpen(false)
    } catch (error) {
      toast({
        title: formState.id ? 'Failed to update event' : 'Failed to create event',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      })
    } finally {
      setIsSaving(false)
    }
  }

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEventRecord[]>()
    events.forEach((event) => {
      const key = format(parseISO(event.startAt), 'yyyy-MM-dd')
      const collection = grouped.get(key)
      if (collection) {
        collection.push(event)
      } else {
        grouped.set(key, [event])
      }
    })

    grouped.forEach((value) => {
      value.sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime())
    })

    return grouped
  }, [events])

  const calendarWeeks = useMemo(() => buildCalendarWeeks(currentMonth), [currentMonth])

  const monthLabel = useMemo(() => format(currentMonth, 'MMMM yyyy'), [currentMonth])

  const shiftMonth = (amount: number) => {
    setCurrentMonth((prev) => {
      const next = amount > 0 ? addMonths(prev, amount) : subMonths(prev, Math.abs(amount))
      setSelectedDate((prevSelected) => {
        const candidate = new Date(prevSelected)
        const maxDay = endOfMonth(next).getDate()
        candidate.setFullYear(next.getFullYear(), next.getMonth(), Math.min(prevSelected.getDate(), maxDay))
        return candidate
      })
      return next
    })
  }

  const eventsForSelectedDate = useMemo(() => {
    return events
      .filter((event) => isSameDay(parseISO(event.startAt), selectedDate))
      .sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime())
  }, [events, selectedDate])

  const upcomingEvents = useMemo(() => {
    const now = new Date()
    return events
      .filter((event) => parseISO(event.startAt) >= now)
      .sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime())
      .slice(0, 5)
  }, [events])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">Calendar</h1>
          <p className="text-sm text-slate-600">Schedule management powered by live CRM events</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" disabled>
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="w-4 h-4 mr-2" />
            New Appointment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
            <CardDescription>Select a date to view or add appointments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm font-semibold text-gray-700">{monthLabel}</div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-7 text-center text-xs font-medium uppercase tracking-wide text-gray-500">
              {weekdayLabels.map((day) => (
                <div key={day} className="py-1">
                  {day}
                </div>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1 text-sm">
              {calendarWeeks.map((week, weekIndex) => (
                <div key={`week-${weekIndex}`} className="contents">
                  {week.map((day) => {
                    const key = format(day, 'yyyy-MM-dd')
                    const dayEvents = eventsByDate.get(key) ?? []
                    const isSelected = isSameDay(day, selectedDate)
                    const inMonth = isSameMonth(day, currentMonth)
                    const today = isToday(day)

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleSelectDate(day)}
                        aria-pressed={isSelected}
                        aria-label={`View events for ${format(day, 'MMMM d, yyyy')}`}
                        className={cn(
                          'flex h-20 flex-col rounded-lg border border-gray-200 bg-white p-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-primary/30 hover:border-primary/60',
                          !inMonth && 'bg-slate-50 text-gray-400 hover:border-gray-200',
                          isSelected && 'border-primary bg-primary/10 shadow-sm',
                          today && !isSelected && 'border-primary/60'
                        )}
                      >
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span>{format(day, 'd')}</span>
                          {today && (
                            <span className="text-[10px] font-medium uppercase text-primary">Today</span>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          {dayEvents.slice(0, 3).map((event) => (
                            <span
                              key={event.id}
                              className={cn('h-2 w-2 rounded-full', eventTypeIndicatorClasses[event.eventType])}
                              title={`${event.title} • ${eventTypeLabel(event.eventType)}`}
                            />
                          ))}
                          {dayEvents.length > 3 && (
                            <span className="text-[10px] text-gray-500">+{dayEvents.length - 3}</span>
                          )}
                        </div>

                        <div className="mt-auto text-[11px] text-gray-500">
                          {dayEvents.length === 0 ? 'No events' : `${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''}`}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Events on {format(selectedDate, 'MMMM d, yyyy')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={`event-skeleton-${index}`} className="h-16 w-full" />
                ))}
              </div>
            ) : eventsForSelectedDate.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 mb-2">No events scheduled for this day</p>
                <Button variant="outline" onClick={openCreateDialog}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Event
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {eventsForSelectedDate.map((event) => (
                  <Card key={event.id} className="border border-gray-200">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                      <div>
                        <CardTitle className="text-lg">{event.title}</CardTitle>
                        <CardDescription>
                          {formatTimeRange(event.startAt, event.endAt)}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Badge className={typeBadgeVariant(event.eventType)}>{eventTypeLabel(event.eventType)}</Badge>
                        <Badge className={statusBadgeVariant(event.status)}>{event.status.toLowerCase()}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {event.notes && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Users className="w-4 h-4 mr-2" />
                          {event.notes}
                        </div>
                      )}
                      {event.location && (
                        <div className="flex items-center text-sm text-gray-600">
                          <CalendarIcon className="w-4 h-4 mr-2" />
                          {event.location}
                        </div>
                      )}
                      <div className="flex items-center text-sm text-gray-600">
                        <Clock className="w-4 h-4 mr-2" />
                        Priority: {priorityLabel(event.priority)}
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => handleEdit(event)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" className="flex-1 text-red-600" onClick={() => handleDelete(event.id)}>
                          <Trash2 className="w-4 h-4 mr-2" /> Remove
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming events</CardTitle>
          <CardDescription>Next five events across your team</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={`upcoming-skeleton-${index}`} className="h-14 w-full" />
              ))}
            </div>
          ) : upcomingEvents.length === 0 ? (
            <p className="text-sm text-gray-500">No upcoming events scheduled.</p>
          ) : (
            <div className="space-y-3">
              {upcomingEvents.map((event) => (
                <div
                  key={`upcoming-${event.id}`}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-gray-600">
                      {format(parseISO(event.startAt), 'MMM d, h:mm a')} • {eventTypeLabel(event.eventType)}
                    </p>
                  </div>
                  <Badge className={statusBadgeVariant(event.status)}>{event.status.toLowerCase()}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{formState.id ? 'Edit event' : 'Schedule event'}</DialogTitle>
            <DialogDescription>
              {formState.id ? 'Update the meeting details' : 'Create a new appointment for your team'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formState.title}
                onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Property showing with John Doe"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formState.date}
                  onChange={(event) => setFormState((prev) => ({ ...prev, date: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="type">Type</Label>
                <Select
                  value={formState.type}
                  onValueChange={(value: CalendarEventRecord['eventType']) =>
                    setFormState((prev) => ({ ...prev, type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startTime">Start time *</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={formState.startTime}
                  onChange={(event) => setFormState((prev) => ({ ...prev, startTime: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="endTime">End time *</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={formState.endTime}
                  onChange={(event) => setFormState((prev) => ({ ...prev, endTime: event.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={formState.location}
                onChange={(event) => setFormState((prev) => ({ ...prev, location: event.target.value }))}
                placeholder="123 Ocean Drive, Miami"
              />
            </div>

            <div>
              <Label htmlFor="notes">Client / internal notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={formState.clientNotes}
                onChange={(event) => setFormState((prev) => ({ ...prev, clientNotes: event.target.value }))}
                placeholder="Include participants, prep work, or dial-in details"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formState.status}
                  onValueChange={(value: CalendarEventRecord['status']) =>
                    setFormState((prev) => ({ ...prev, status: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={formState.priority}
                  onValueChange={(value: CalendarEventRecord['priority']) =>
                    setFormState((prev) => ({ ...prev, priority: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? 'Saving…' : formState.id ? 'Update event' : 'Create event'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CalendarPage
