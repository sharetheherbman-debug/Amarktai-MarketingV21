'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, X } from 'lucide-react';
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
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [platform, setPlatform] = useState('all');
  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchEvents = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<ApiResponse<CalendarEvent[]>>('/calendar', { params: {
        month: String(currentDate.getMonth() + 1), year: String(currentDate.getFullYear()),
      } });
      setEvents(res.data || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The calendar could not be loaded.');
    } finally { setLoading(false); }
  }, [orgId, currentDate]);

  useEffect(() => { void fetchEvents(); }, [fetchEvents]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const platforms = useMemo(() => ['all', ...Array.from(new Set(events.map((event) => event.platform).filter(Boolean) as string[]))], [events]);
  const visibleEvents = platform === 'all' ? events : events.filter((event) => event.platform === platform);
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDay + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });
  const eventsForDay = (day: number) => {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return visibleEvents.filter((event) => event.scheduled_date === date);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-bold text-white">Calendar</h1><p className="mt-1 text-sm text-zinc-400">A compact view of scheduled content and publishing activity.</p></div>
        <Link href="/content-studio/generate" className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Create content</Link>
      </header>

      {error && <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}<button type="button" onClick={() => void fetchEvents()} className="ml-auto font-semibold">Try again</button></div>}

      <section className="overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-100 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous month" onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.04]"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" aria-label="Next month" onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.04]"><ChevronRight className="h-5 w-5" /></button>
            <button type="button" onClick={() => setCurrentDate(new Date())} className="ml-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-400">Today</button>
          </div>
          <h2 className="text-base font-semibold text-white">{MONTHS[month]} {year}</h2>
          <label className="text-xs text-zinc-500">Platform <select value={platform} onChange={(event) => setPlatform(event.target.value)} className="ml-2 h-8 rounded-lg border border-white/10 bg-surface-200 px-2 text-xs text-white">{platforms.map((item) => <option key={item} value={item}>{item === 'all' ? 'All' : item}</option>)}</select></label>
        </div>

        {loading ? <div className="flex h-[456px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div> : (
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-7 border-b border-white/[0.06]">{DAYS.map((day) => <div key={day} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{day}</div>)}</div>
              <div className="grid grid-cols-7">
                {cells.map((day, index) => {
                  const dayEvents = day ? eventsForDay(day) : [];
                  const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                  return <div key={index} className={`h-[76px] border-b border-r border-white/[0.06] p-1.5 ${day ? 'bg-white' : 'bg-[#f8f6f3]'}`}>
                    {day && <><div className={`mb-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${isToday ? 'bg-brand-500 text-white' : 'text-zinc-500'}`}>{day}</div><div className="space-y-0.5">{dayEvents.slice(0, 2).map((event) => <button type="button" key={event.id} onClick={() => setSelected(event)} className="block w-full truncate rounded bg-brand-500/10 px-1.5 py-0.5 text-left text-[10px] font-medium text-brand-700 hover:bg-brand-500/20">{event.scheduled_time ? `${event.scheduled_time.slice(0, 5)} ` : ''}{event.title}</button>)}{dayEvents.length > 2 && <button type="button" onClick={() => setSelected(dayEvents[2])} className="block text-[10px] font-semibold text-zinc-500">+{dayEvents.length - 2} more</button>}</div></>}
                  </div>;
                })}
              </div>
            </div>
          </div>
        )}
        {!loading && events.length === 0 && <div className="border-t border-white/[0.06] px-4 py-3 text-center text-xs text-zinc-500">Nothing is scheduled this month.</div>}
      </section>

      {selected && <div role="dialog" aria-modal="true" aria-label="Scheduled content details" className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a2e3e]/30 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><div className="w-full max-w-md rounded-2xl border border-[#e0dbd3] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><div className="rounded-lg bg-brand-500/10 p-2 text-brand-600"><CalendarDays className="h-5 w-5" /></div><div><h2 className="text-lg font-semibold text-[#1a2e3e]">{selected.title}</h2><p className="mt-1 text-sm text-[#5f6f7a]">{new Date(`${selected.scheduled_date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}{selected.scheduled_time ? ` at ${selected.scheduled_time.slice(0, 5)}` : ''}</p></div></div><button type="button" aria-label="Close details" onClick={() => setSelected(null)} className="rounded p-1 text-[#788791]"><X className="h-5 w-5" /></button></div><dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-[#788791]">Status</dt><dd className="mt-1 capitalize text-[#1a2e3e]">{selected.status}</dd></div><div><dt className="text-[#788791]">Platform</dt><dd className="mt-1 capitalize text-[#1a2e3e]">{selected.platform || 'Not selected'}</dd></div><div><dt className="text-[#788791]">Content type</dt><dd className="mt-1 capitalize text-[#1a2e3e]">{selected.content_type?.replaceAll('_', ' ') || 'Content'}</dd></div></dl></div></div>}
    </div>
  );
}
