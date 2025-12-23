import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Calendar as CalendarIcon,
  Clock,
  User,
  Filter,
  Search
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import EventModal from './EventModal';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  color: string;
  assignedAgent: string;
  status: 'pending' | 'in-progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  eventType: string;
}

interface CalendarProps {
  events?: CalendarEvent[];
  onEventCreate?: (event: Omit<CalendarEvent, 'id'>) => void;
  onEventUpdate?: (event: CalendarEvent) => void;
  onEventDelete?: (eventId: string) => void;
}

const Calendar = ({ events = [], onEventCreate, onEventUpdate, onEventDelete }: CalendarProps) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAgent, setFilterAgent] = useState('all');

  // Mock agents data
  const agents = [
    { id: '1', name: 'Sarah Johnson' },
    { id: '2', name: 'Mike Rodriguez' },
    { id: '3', name: 'Lisa Chen' },
    { id: '4', name: 'David Wilson' }
  ];

  // Generate calendar days for current month
  const generateCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const days = [];
    const current = new Date(startDate);
    
    for (let i = 0; i < 42; i++) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    return days;
  };

  // Filter events based on search and agent filter
  const filteredEvents = events.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         event.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAgent = filterAgent === 'all' || event.assignedAgent === filterAgent;
    return matchesSearch && matchesAgent;
  });

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    return filteredEvents.filter(event => {
      const eventDate = new Date(event.startDate);
      return eventDate.toDateString() === date.toDateString();
    });
  };

  const handlePrevious = () => {
    const newDate = new Date(currentDate);
    if (view === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() - 1);
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (view === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setCurrentDate(newDate);
  };

  const handleEventCreate = (eventData: Omit<CalendarEvent, 'id'>) => {
    onEventCreate?.(eventData);
    setIsEventModalOpen(false);
    setSelectedEvent(null);
  };

  const handleEventUpdate = (eventData: CalendarEvent) => {
    onEventUpdate?.(eventData);
    setSelectedEvent(null);
    setIsEventModalOpen(false);
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setIsEventModalOpen(true);
  };

  const handleNewEventClick = () => {
    setSelectedEvent(null);
    setIsEventModalOpen(true);
  };

  const handleModalClose = () => {
    setIsEventModalOpen(false);
    setSelectedEvent(null);
  };

  const formatDate = (date: Date) => {
    if (view === 'day') {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
    if (view === 'week') {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${startLabel} – ${endLabel}`;
    }
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long'
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in-progress': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const calendarDays = generateCalendarDays();
  const weekDays = (() => {
    const start = new Date(currentDate);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, idx) => {
      const day = new Date(start);
      day.setDate(start.getDate() + idx);
      return day;
    });
  })();

  return (
    <div className="space-y-4">
      {/* Calendar Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5" />
                Calendar
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handlePrevious}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="font-medium min-w-[200px] text-center">
                  {formatDate(currentDate)}
                </span>
                <Button variant="outline" size="sm" onClick={handleNext}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search events..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-48"
                />
              </div>
              
              {/* Agent Filter */}
              <select
                value={filterAgent}
                onChange={(e) => setFilterAgent(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All Agents</option>
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
              
              {/* View Buttons */}
              <div className="flex border rounded-lg">
                {['month', 'week', 'day'].map((viewType) => (
                  <Button
                    key={viewType}
                    variant={view === viewType ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setView(viewType as any)}
                    className="capitalize"
                  >
                    {viewType}
                  </Button>
                ))}
              </div>
              
              <Button onClick={handleNewEventClick}>
                <Plus className="w-4 h-4 mr-2" />
                New Event
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {view === 'month' && (
            <div className="grid grid-cols-7 gap-1">
              {/* Day Headers */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="p-2 text-center font-medium text-gray-600 text-sm">
                  {day}
                </div>
              ))}
              
              {/* Calendar Days */}
              {calendarDays.map((day, index) => {
                const dayEvents = getEventsForDate(day);
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                const isToday = day.toDateString() === new Date().toDateString();
                
                return (
                  <div
                    key={index}
                    className={`min-h-[100px] p-1 border border-gray-200 ${
                      !isCurrentMonth ? 'bg-gray-50 text-gray-400' : 'bg-white'
                    } ${isToday ? 'bg-blue-50 border-blue-200' : ''}`}
                  >
                    <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : ''}`}>
                      {day.getDate()}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 2).map((event) => (
                        <div
                          key={event.id}
                          onClick={() => handleEventClick(event)}
                          className="text-xs p-1 rounded cursor-pointer hover:opacity-80 truncate"
                          style={{ backgroundColor: event.color + '20', color: event.color }}
                        >
                          {event.title}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div className="text-xs text-gray-500">
                          +{dayEvents.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {view === 'week' && (
            <div className="grid gap-2 md:grid-cols-7">
              {weekDays.map((day) => {
                const dayEvents = getEventsForDate(day);
                const isToday = day.toDateString() === new Date().toDateString();
                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-[140px] rounded-lg border border-gray-200 bg-white p-2 ${
                      isToday ? 'border-blue-200 bg-blue-50/40' : ''
                    }`}
                  >
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <div className={`text-xs font-semibold ${isToday ? 'text-blue-700' : 'text-gray-700'}`}>
                        {day.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div className={`text-xs ${isToday ? 'text-blue-700' : 'text-gray-500'}`}>{day.getDate()}</div>
                    </div>
                    <div className="space-y-1">
                      {dayEvents.length === 0 ? (
                        <div className="text-[11px] text-gray-400">No events</div>
                      ) : (
                        dayEvents.slice(0, 6).map((event) => (
                          <div
                            key={event.id}
                            onClick={() => handleEventClick(event)}
                            className="cursor-pointer truncate rounded px-1 py-0.5 text-[11px] hover:opacity-80"
                            style={{ backgroundColor: event.color + '18', color: event.color }}
                          >
                            {event.title}
                          </div>
                        ))
                      )}
                      {dayEvents.length > 6 ? (
                        <div className="text-[11px] text-gray-500">+{dayEvents.length - 6} more</div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {view === 'day' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-800">
                    {currentDate.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                  <div className="text-xs text-gray-500">{currentDate.getFullYear()}</div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Events</div>
                <div className="space-y-2">
                  {getEventsForDate(currentDate).length === 0 ? (
                    <div className="py-6 text-center text-sm text-gray-500">No events scheduled.</div>
                  ) : (
                    getEventsForDate(currentDate).map((event) => (
                      <div
                        key={event.id}
                        onClick={() => handleEventClick(event)}
                        className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/40 px-3 py-2 hover:bg-gray-50"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-gray-900">{event.title}</div>
                          <div className="mt-0.5 line-clamp-2 text-xs text-gray-600">{event.description}</div>
                        </div>
                        <Badge className={getPriorityColor(event.priority)}>{event.priority}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Events */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Upcoming Events</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredEvents
              .filter(event => new Date(event.startDate) >= new Date())
              .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
              .slice(0, 5)
              .map((event) => (
                <div
                  key={event.id}
                  onClick={() => handleEventClick(event)}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: event.color }}
                    />
                    <div>
                      <div className="font-medium">{event.title}</div>
                      <div className="text-sm text-gray-600 flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        {new Date(event.startDate).toLocaleDateString()}
                        <User className="w-3 h-3 ml-2" />
                        {agents.find(a => a.id === event.assignedAgent)?.name || 'Unassigned'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getPriorityColor(event.priority)}>
                      {event.priority}
                    </Badge>
                    <Badge className={getStatusColor(event.status)}>
                      {event.status}
                    </Badge>
                  </div>
                </div>
              ))}
            
            {filteredEvents.filter(event => new Date(event.startDate) >= new Date()).length === 0 && (
              <div className="text-center py-4 text-gray-500">
                No upcoming events
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Event Modal */}
      <EventModal
        isOpen={isEventModalOpen}
        onClose={handleModalClose}
        onSave={selectedEvent ? handleEventUpdate : handleEventCreate}
        onDelete={onEventDelete}
        event={selectedEvent}
        agents={agents}
      />
    </div>
  );
};

export default Calendar;
