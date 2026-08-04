'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays,
  Plus,
  Loader2,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface CalendarEvent {
  id: string;
  title: string;
  platform: string | null;
  content_type: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchEvents = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await api.get<ApiResponse<CalendarEvent[]>>('/calendar', {
        params: {
          organization_id: orgId,
          month: String(currentDate.getMonth() + 1),
          year: String(currentDate.getFullYear()),
        },
      });
      setEvents(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, [orgId, currentDate]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter(e => e.scheduled_date === dateStr);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Content Calendar</h1>
          <p className="mt-1 text-sm text-zinc-400">Schedule and manage your content publishing.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400">
          <Plus className="h-4 w-4" /> Schedule Content
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <button onClick={prevMonth} className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.04] hover:text-white">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-white">{MONTHS[month]} {year}</h2>
          <button onClick={nextMonth} className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.04] hover:text-white">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div>
        ) : (
          <div className="grid grid-cols-7 gap-px bg-white/[0.04] rounded-lg overflow-hidden">
            {DAYS.map(day => (
              <div key={day} className="bg-surface-100 p-3 text-center text-xs font-semibold text-zinc-400">{day}</div>
            ))}
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`empty-${i}`} className="bg-surface-100 p-3 min-h-[100px]" />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dayEvents = getEventsForDay(day);
              const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
              return (
                <div key={day} className={`bg-surface-100 p-2 min-h-[100px] ${isToday ? 'ring-1 ring-brand-500/50' : ''}`}>
                  <div className={`text-sm font-medium mb-2 ${isToday ? 'text-brand-400' : 'text-zinc-300'}`}>{day}</div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 2).map(event => (
                      <div key={event.id} className="rounded bg-brand-500/10 px-2 py-1 text-[11px] text-brand-300 truncate">
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[11px] text-zinc-500">+{dayEvents.length - 2} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
