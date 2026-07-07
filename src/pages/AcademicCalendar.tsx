import React, { useState, useMemo, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight,
  BookOpen, Clock, GraduationCap, Coffee, AlertCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────
type EventType = 'registration' | 'orientation' | 'lectures' | 'break' | 'study' | 'exam';

interface CalEvent {
  type: EventType;
  title: string;
  date: string;
  duration?: string;
  notes?: string[];
  start: string; // ISO yyyy-mm-dd
  end: string;   // ISO yyyy-mm-dd
}

interface Semester {
  id: string;
  label: string;
  short: string;
  color: string;
  bg: string;
  events: CalEvent[];
}

// ── Priority for overlapping ranges ──────────────────────────────────────
const PRIORITY: Record<EventType, number> = {
  exam: 6, study: 5, break: 4, orientation: 3, registration: 2, lectures: 1,
};

// ── All public holidays / special dates ───────────────────────────────────
const HOLIDAYS = new Set([
  '2026-07-31','2026-08-25','2026-08-31',
  '2026-11-08','2026-11-09',
  '2026-12-25','2027-01-01','2027-01-22',
  '2027-02-24',
  '2027-03-10','2027-03-11','2027-03-12',
  '2027-05-01','2027-05-17','2027-05-20','2027-05-22',
  '2027-06-06','2027-06-07',
  '2027-07-30','2027-08-15','2027-08-16','2027-08-31',
]);

// ── Calendar data ─────────────────────────────────────────────────────────
const SEMESTERS: Semester[] = [
  {
    id: 'prelim', label: 'Preliminary Semester', short: 'Prelim',
    color: 'text-violet-600', bg: 'bg-violet-500',
    events: [
      { type: 'registration', title: 'Registration — New Students (Diploma)',
        date: '19 July 2026', duration: '1 Day',
        start: '2026-07-19', end: '2026-07-19' },
      { type: 'orientation', title: 'Student Orientation',
        date: '19 – 20 July 2026', duration: '2 Days',
        start: '2026-07-19', end: '2026-07-20' },
      { type: 'lectures', title: 'Lectures',
        date: '21 July – 11 September 2026', duration: '8 Weeks',
        notes: ['31 July — Birthday of KDPB Sultan Pahang','25 August — Maulidur Rasul','31 August — National Day'],
        start: '2026-07-21', end: '2026-09-11' },
      { type: 'exam', title: 'Examination',
        date: '14 – 15 September 2026', duration: '2 Days',
        start: '2026-09-14', end: '2026-09-15' },
    ],
  },
  {
    id: 'sem1', label: 'Semester I 2026/2027', short: 'Sem I',
    color: 'text-blue-600', bg: 'bg-blue-500',
    events: [
      { type: 'registration', title: 'Registration — New Students (Bachelor Degree)',
        date: '19 September 2026', duration: '1 Day',
        start: '2026-09-19', end: '2026-09-19' },
      { type: 'registration', title: 'Online Registration — Diploma & Senior Students',
        date: '26 September 2026', duration: '1 Day',
        start: '2026-09-26', end: '2026-09-26' },
      { type: 'orientation', title: 'Student Orientation',
        date: '19 – 23 September 2026', duration: '5 Days',
        start: '2026-09-19', end: '2026-09-23' },
      { type: 'lectures', title: 'Lectures',
        date: '28 September – 13 November 2026', duration: '7 Weeks',
        notes: ['28 Sep – 2 Oct — Online classes','8 November — Deepavali','9 November — Replacement Leave (Deepavali)','10 – 13 November — Online classes'],
        start: '2026-09-28', end: '2026-11-13' },
      { type: 'break', title: 'Mid-Semester Break',
        date: '14 – 22 November 2026', duration: '1 Week',
        start: '2026-11-14', end: '2026-11-22' },
      { type: 'lectures', title: 'Lectures',
        date: '23 November 2026 – 8 January 2027', duration: '7 Weeks',
        notes: ['25 December — Christmas Day','1 January 2027 — New Year'],
        start: '2026-11-23', end: '2027-01-08' },
      { type: 'study', title: 'Study Week',
        date: '9 – 17 January 2027', duration: '1 Week',
        start: '2027-01-09', end: '2027-01-17' },
      { type: 'exam', title: 'Examination',
        date: '18 January – 3 February 2027', duration: '12 Days',
        notes: ['22 January — No examination (Thaipusam)'],
        start: '2027-01-18', end: '2027-02-03' },
    ],
  },
  {
    id: 'sem2', label: 'Semester II 2026/2027', short: 'Sem II',
    color: 'text-emerald-600', bg: 'bg-emerald-500',
    events: [
      { type: 'registration', title: 'Registration — New Students (Bachelor Degree, Direct Entry)',
        date: '19 February 2027', duration: '1 Day',
        start: '2027-02-19', end: '2027-02-19' },
      { type: 'orientation', title: 'Student Orientation',
        date: '19 – 20 February 2027', duration: '2 Days',
        start: '2027-02-19', end: '2027-02-20' },
      { type: 'lectures', title: 'Lectures',
        date: '22 February – 9 April 2027', duration: '7 Weeks',
        notes: ['24 February — Nuzul Quran','8, 9, 15–19 March — Online classes','10 & 11 March — Hari Raya Aidil Fitri 1448H','12 March — Replacement Leave (Hari Raya)'],
        start: '2027-02-22', end: '2027-04-09' },
      { type: 'break', title: 'Mid-Semester Break',
        date: '10 – 18 April 2027', duration: '1 Week',
        start: '2027-04-10', end: '2027-04-18' },
      { type: 'lectures', title: 'Lectures',
        date: '19 April – 4 June 2027', duration: '7 Weeks',
        notes: ['1 May — Labour Day','17 May — Hari Raya Aidil Adha 1448H','18, 19 & 21 May — Online classes','20 May — Wesak Day','22 May — Hol Pahang Day'],
        start: '2027-04-19', end: '2027-06-04' },
      { type: 'study', title: 'Study Week',
        date: '5 – 13 June 2027', duration: '1 Week',
        notes: ['6 June — Awal Muharram','7 June — Birthday of KDYMM Yang Dipertuan Agong & Replacement Leave'],
        start: '2027-06-05', end: '2027-06-13' },
      { type: 'exam', title: 'Examination',
        date: '14 – 29 June 2027', duration: '12 Days',
        start: '2027-06-14', end: '2027-06-29' },
    ],
  },
  {
    id: 'short', label: 'Short Semester', short: 'Short',
    color: 'text-amber-600', bg: 'bg-amber-500',
    events: [
      { type: 'registration', title: 'Short Course Registration',
        date: '28 – 29 June 2027', duration: '2 Days',
        start: '2027-06-28', end: '2027-06-29' },
      { type: 'lectures', title: 'Lectures',
        date: '12 July – 3 September 2027', duration: '8 Weeks',
        notes: ['30 July — Birthday of KDPB Sultan Pahang','15 August — Maulidur Rasul','16 August — Replacement Leave (Maulidur Rasul)','31 August — National Day'],
        start: '2027-07-12', end: '2027-09-03' },
      { type: 'exam', title: 'Examination',
        date: '6 – 10 September 2027', duration: '5 Days',
        start: '2027-09-06', end: '2027-09-10' },
    ],
  },
];

// ── Event config ──────────────────────────────────────────────────────────
const CFG: Record<EventType, { bar: string; bg: string; text: string; badge: string; icon: React.ElementType; label: string }> = {
  registration: { bar: 'bg-blue-500',    bg: 'bg-blue-50 border-blue-100',      text: 'text-blue-700',    badge: 'bg-blue-100 text-blue-600',    icon: GraduationCap, label: 'Registration' },
  orientation:  { bar: 'bg-purple-500',  bg: 'bg-purple-50 border-purple-100',  text: 'text-purple-700',  badge: 'bg-purple-100 text-purple-600', icon: BookOpen,      label: 'Orientation'  },
  lectures:     { bar: 'bg-emerald-500', bg: 'bg-emerald-50 border-emerald-100',text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-600',icon: BookOpen,     label: 'Lectures'     },
  break:        { bar: 'bg-slate-400',   bg: 'bg-slate-50 border-slate-200',    text: 'text-slate-600',   badge: 'bg-slate-100 text-slate-500',   icon: Coffee,        label: 'Break'        },
  study:        { bar: 'bg-amber-500',   bg: 'bg-amber-50 border-amber-100',    text: 'text-amber-700',   badge: 'bg-amber-100 text-amber-600',   icon: Clock,         label: 'Study Week'   },
  exam:         { bar: 'bg-red-500',     bg: 'bg-red-50 border-red-100',        text: 'text-red-700',     badge: 'bg-red-100 text-red-600',       icon: AlertCircle,   label: 'Examination'  },
};

// Calendar cell background (lighter for the grid)
const CAL_BG: Record<EventType, string> = {
  registration: 'bg-blue-100 text-blue-800',
  orientation:  'bg-purple-100 text-purple-800',
  lectures:     'bg-emerald-100 text-emerald-800',
  break:        'bg-slate-200 text-slate-500',
  study:        'bg-amber-100 text-amber-800',
  exam:         'bg-red-500 text-white font-extrabold',
};

const toDateStr = (d: Date) => d.toISOString().split('T')[0];

// ── Build date → eventType map ────────────────────────────────────────────
function buildDateMap(src: Semester[] = SEMESTERS): Map<string, EventType> {
  const map = new Map<string, EventType>();
  for (const sem of src) {
    for (const ev of sem.events) {
      const end = new Date(ev.end + 'T00:00:00');
      const cur = new Date(ev.start + 'T00:00:00');
      while (cur <= end) {
        const key = toDateStr(cur);
        const existing = map.get(key);
        if (!existing || PRIORITY[ev.type] > PRIORITY[existing]) {
          map.set(key, ev.type);
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
  }
  return map;
}

const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

// ── Component ─────────────────────────────────────────────────────────────
export const AcademicCalendar: React.FC = () => {
  const [calMonth, setCalMonth] = useState({ year: 2026, month: 6 }); // July 2026
  const [activeSem, setActiveSem] = useState('sem1');

  // Live data from DB — falls back to hardcoded SEMESTERS if nothing in DB
  const [liveSemesters, setLiveSemesters] = useState<Semester[] | null>(null);
  const [liveHolidays, setLiveHolidays]   = useState<Set<string> | null>(null);
  const [calYear, setCalYear]             = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('academic_calendars')
      .select('academic_year, semesters, holidays')
      .eq('is_active', true)
      .eq('university', 'UMPSA')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setLiveSemesters(data.semesters as Semester[]);
        setLiveHolidays(new Set(data.holidays as string[]));
        setCalYear(data.academic_year);
        // Jump calendar to the first event month
        const firstSem = (data.semesters as Semester[])[0];
        if (firstSem?.events?.[0]?.start) {
          const d = new Date(firstSem.events[0].start + 'T00:00:00');
          setCalMonth({ year: d.getFullYear(), month: d.getMonth() });
        }
      });
  }, []);

  const semesters  = liveSemesters ?? SEMESTERS;
  const holidaySet = liveHolidays  ?? HOLIDAYS;

  const dateMap = useMemo(
    () => buildDateMap(semesters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveSemesters],
  );
  const semester = semesters.find(s => s.id === activeSem) ?? semesters[0];

  const monthLabel = () =>
    new Date(calMonth.year, calMonth.month, 1)
      .toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });

  const calDays = (): (string | null)[] => {
    const { year, month } = calMonth;
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return cells;
  };

  const prevMonth = () => setCalMonth(m => {
    const d = new Date(m.year, m.month - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const nextMonth = () => setCalMonth(m => {
    const d = new Date(m.year, m.month + 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const todayStr = toDateStr(new Date());

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto no-scrollbar pb-24">

      {/* ── CALENDAR ── */}
      <div className="bg-white border-b border-slate-100 shadow-sm">

        {/* Year label */}
        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
          <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">UMPSA Academic Calendar</p>
          <span className="text-xs font-extrabold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            {calYear ?? '2026/2027'}
          </span>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between px-4 pb-2">
          <button onClick={prevMonth}
            className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 active:scale-90 transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-sm font-extrabold text-slate-700">{monthLabel()}</p>
          <button onClick={nextMonth}
            className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 active:scale-90 transition">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 px-3 mb-1">
          {DAYS.map(d => (
            <div key={d} className="text-center text-xs font-extrabold text-slate-400">{d}</div>
          ))}
        </div>

        {/* Date cells */}
        <div className="grid grid-cols-7 gap-y-0.5 px-3 pb-3">
          {calDays().map((dateStr, i) => {
            if (!dateStr) return <div key={i} />;
            const evType = dateMap.get(dateStr);
            const isHoliday = holidaySet.has(dateStr);
            const isToday   = dateStr === todayStr;
            const cellCls   = evType ? CAL_BG[evType] : 'text-slate-600';

            return (
              <div key={dateStr}
                className={`aspect-square flex flex-col items-center justify-center rounded-xl text-xs font-bold relative mx-0.5 my-0.5 transition ${cellCls} ${
                  isToday ? 'ring-2 ring-offset-1 ring-primary' : ''
                }`}>
                {parseInt(dateStr.split('-')[2])}
                {isHoliday && evType && evType !== 'exam' && (
                  <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-orange-400" />
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3">
          {(Object.keys(CFG) as EventType[]).map(t => (
            <span key={t} className="flex items-center gap-1 text-xs font-bold text-slate-500">
              <span className={`w-2.5 h-2.5 rounded-sm ${CFG[t].bar}`} />
              {CFG[t].label}
            </span>
          ))}
          <span className="flex items-center gap-1 text-xs font-bold text-slate-500">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
            Holiday
          </span>
        </div>
      </div>

      {/* ── EVENT LIST ── */}
      <div>

        {/* Semester tabs */}
        <div className="flex gap-2 px-4 pt-3 pb-2 overflow-x-auto no-scrollbar">
          {SEMESTERS.map(s => (
            <button key={s.id} onClick={() => setActiveSem(s.id)}
              className={`shrink-0 px-4 py-1.5 rounded-2xl text-xs font-extrabold border transition active:scale-95 ${
                activeSem === s.id
                  ? `${s.bg} text-white border-transparent shadow-sm`
                  : 'bg-white text-slate-500 border-slate-100'
              }`}>
              {s.short}
            </button>
          ))}
        </div>

        <div className="px-4 flex flex-col gap-3 pb-4">
          <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">{semester.label}</p>

          {semester.events.map((ev, i) => {
            const cfg = CFG[ev.type];
            const Icon = cfg.icon;
            return (
              <div key={i} className={`bg-white border rounded-2xl overflow-hidden shadow-sm ${cfg.bg}`}>
                <div className="flex">
                  <div className={`w-1 shrink-0 ${cfg.bar}`} />
                  <div className="flex-1 px-4 py-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`flex items-center gap-1 text-xs font-extrabold uppercase tracking-wider ${cfg.text}`}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                      {ev.duration && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                          {ev.duration}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-extrabold text-slate-800 leading-snug">{ev.title}</p>
                    <p className="text-xs font-bold text-slate-500">{ev.date}</p>
                    {ev.notes && (
                      <div className="mt-0.5 flex flex-col gap-1">
                        {ev.notes.map((note, j) => (
                          <div key={j} className="flex items-start gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                            <p className="text-xs text-slate-400 font-semibold leading-tight">{note}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Disclaimer */}
          <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex gap-2 items-start">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 font-semibold leading-relaxed">
              Based on UMPSA Academic Calendar {calYear ?? '2026/2027'}. Subject to change — refer to official university announcements.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
