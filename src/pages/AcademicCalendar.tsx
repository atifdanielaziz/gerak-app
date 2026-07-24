import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ChevronLeft, ChevronRight,
  BookOpen, Clock, GraduationCap, Coffee, AlertCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toDateStr } from '../lib/format';
import { useApp } from '../context/AppContext';

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
// national: false → a state-specific (Pahang) or UMPSA-internal replacement-
// leave day, shown with a "This is not a national holiday." note in the day
// detail page, same as how Malaysia's own gazette data distinguishes them.
interface Holiday { date: string; label: string; national: boolean; }

// Dates originally sourced from UMPSA's own academic calendar Remarks column
// (institution-specific replacement-leave/make-up days included) are merged
// with federal + Pahang state public holidays for 2026/2027 pulled from
// github.com/Junhui20/malaysia-calendar-api (MIT-licensed, sourced from the
// Federal Gazette/JAKIM/KPM) — added 2026-07-24 so months outside academic
// term still show accurate national/state holidays, not just UMPSA's own.
// Scoped to states: ["*"] (nationwide) or ["pahang"] only, since both UMPSA
// campuses are in Pahang. `national` cross-checked against that same source's
// per-date `states` coverage (UMPSA-only replacement-leave days, absent from
// that dataset entirely, are hardcoded false).
const HOLIDAYS: Holiday[] = [
  { date: '2026-01-01', label: "New Year's Day", national: false },
  { date: '2026-01-17', label: "Isra' Mi'raj", national: false },
  { date: '2026-02-01', label: 'Thaipusam', national: false },
  { date: '2026-02-17', label: 'Chinese New Year', national: true },
  { date: '2026-02-18', label: 'Chinese New Year (2nd Day)', national: true },
  { date: '2026-03-07', label: 'Revelation of the Quran', national: true },
  { date: '2026-03-20', label: 'Hari Raya Aidilfitri (Additional Public Holiday)', national: true },
  { date: '2026-03-21', label: 'Eid al-Fitr', national: true },
  { date: '2026-03-22', label: 'Eid al-Fitr (2nd Day)', national: true },
  { date: '2026-05-01', label: 'Labour Day', national: true },
  { date: '2026-05-22', label: 'Pahang Hol Day', national: false },
  { date: '2026-05-27', label: 'Eid al-Adha', national: true },
  { date: '2026-05-28', label: 'Eid al-Adha (2nd Day)', national: true },
  { date: '2026-05-31', label: 'Vesak Day', national: true },
  { date: '2026-06-01', label: 'Official Birthday of the Yang di-Pertuan Agong', national: true },
  { date: '2026-06-17', label: 'Islamic New Year', national: true },
  { date: '2026-07-31', label: 'Birthday of KDPB Sultan Pahang', national: false },
  { date: '2026-08-25', label: 'Maulidur Rasul', national: true },
  { date: '2026-08-31', label: 'National Day', national: true },
  { date: '2026-09-16', label: 'Malaysia Day', national: true },
  { date: '2026-11-08', label: 'Deepavali', national: true },
  { date: '2026-11-09', label: 'Replacement Leave (Deepavali)', national: false },
  { date: '2026-12-25', label: 'Christmas Day', national: true },
  { date: '2027-01-01', label: 'New Year', national: false },
  { date: '2027-01-06', label: "Isra' Mi'raj", national: false },
  { date: '2027-01-22', label: 'Thaipusam', national: false },
  { date: '2027-02-06', label: 'Chinese New Year', national: true },
  { date: '2027-02-07', label: 'Chinese New Year (2nd Day)', national: true },
  { date: '2027-02-24', label: 'Nuzul Quran', national: false },
  { date: '2027-03-10', label: 'Hari Raya Aidil Fitri 1448H', national: true },
  { date: '2027-03-11', label: 'Hari Raya Aidil Fitri 1448H', national: true },
  { date: '2027-03-12', label: 'Replacement Leave (Hari Raya)', national: false },
  { date: '2027-05-01', label: 'Labour Day', national: true },
  { date: '2027-05-17', label: 'Hari Raya Aidil Adha 1448H', national: true },
  { date: '2027-05-20', label: 'Wesak Day', national: true },
  { date: '2027-05-22', label: 'Hol Pahang Day', national: false },
  { date: '2027-06-06', label: 'Awal Muharram', national: true },
  { date: '2027-06-07', label: 'Birthday of KDYMM Yang Dipertuan Agong & Replacement Leave', national: true },
  { date: '2027-07-30', label: 'Birthday of KDPB Sultan Pahang', national: false },
  { date: '2027-08-15', label: 'Maulidur Rasul', national: true },
  { date: '2027-08-16', label: 'Replacement Leave (Maulidur Rasul)', national: false },
  { date: '2027-08-31', label: 'National Day', national: true },
  { date: '2027-09-16', label: 'Malaysia Day', national: true },
  { date: '2027-10-28', label: 'Deepavali', national: true },
  { date: '2027-12-25', label: 'Christmas Day', national: true },
];

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
  break:        { bar: 'bg-slate-400',   bg: 'bg-white border-slate-100',       text: 'text-slate-600',   badge: 'bg-slate-100 text-slate-500',   icon: Coffee,        label: 'Break'        },
  study:        { bar: 'bg-amber-500',   bg: 'bg-amber-50 border-amber-100',    text: 'text-amber-700',   badge: 'bg-amber-100 text-amber-600',   icon: Clock,         label: 'Study Week'   },
  exam:         { bar: 'bg-red-500',     bg: 'bg-red-50 border-red-100',        text: 'text-red-700',     badge: 'bg-red-100 text-red-600',       icon: AlertCircle,   label: 'Examination'  },
};

// ── Build date → event map (full event, not just its type — the day detail
// page needs the actual title too) ────────────────────────────────────────
function buildDateMap(src: Semester[] = SEMESTERS): Map<string, CalEvent> {
  const map = new Map<string, CalEvent>();
  for (const sem of src) {
    for (const ev of sem.events) {
      const end = new Date(ev.end + 'T00:00:00');
      const cur = new Date(ev.start + 'T00:00:00');
      while (cur <= end) {
        const key = toDateStr(cur);
        const existing = map.get(key);
        if (!existing || PRIORITY[ev.type] > PRIORITY[existing.type]) {
          map.set(key, ev);
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
  const { setLeaveGuard } = useApp();
  const [calMonth, setCalMonth] = useState({ year: 2026, month: 6 }); // July 2026
  const [activeSem, setActiveSem] = useState('sem1');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Live data from DB — falls back to hardcoded SEMESTERS/HOLIDAYS if nothing uploaded
  const [liveSemesters, setLiveSemesters] = useState<Semester[] | null>(null);
  const [liveHolidays, setLiveHolidays]   = useState<Holiday[] | null>(null);
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
        // Older uploads stored holidays as plain date strings (no name/scope) —
        // normalize so both shapes work.
        const rawHolidays = (data.holidays ?? []) as (string | Holiday)[];
        setLiveHolidays(rawHolidays.map(h => typeof h === 'string' ? { date: h, label: '', national: true } : h));
        setCalYear(data.academic_year);
        // Jump calendar to the first event month
        const firstSem = (data.semesters as Semester[])[0];
        if (firstSem?.events?.[0]?.start) {
          const d = new Date(firstSem.events[0].start + 'T00:00:00');
          setCalMonth({ year: d.getFullYear(), month: d.getMonth() });
        }
      });
  }, []);

  // The day-detail sub-page is reached by tapping a date, not a separate
  // route — registering a leaveGuard makes the header back chevron,
  // hardware back, and the edge-swipe gesture all close it (returning to the
  // month grid) instead of leaving Academic Calendar entirely, same pattern
  // as Jubah's internal picker/form back-chain.
  useEffect(() => {
    setLeaveGuard(selectedDate ? () => () => setSelectedDate(null) : null);
    return () => setLeaveGuard(null);
  }, [selectedDate, setLeaveGuard]);

  const semesters = liveSemesters ?? SEMESTERS;
  const holidays   = liveHolidays  ?? HOLIDAYS;

  const dateMap = useMemo(
    () => buildDateMap(semesters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveSemesters],
  );
  const holidayMap = useMemo(
    () => new Map(holidays.map(h => [h.date, h])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveHolidays],
  );

  const jumpToSemester = (s: Semester) => {
    setActiveSem(s.id);
    const first = s.events[0];
    if (first?.start) {
      const d = new Date(first.start + 'T00:00:00');
      setCalMonth({ year: d.getFullYear(), month: d.getMonth() });
    }
  };

  const formatDetailDate = (dateStr: string) =>
    new Date(dateStr + 'T00:00:00').toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const monthLabel = () =>
    new Date(calMonth.year, calMonth.month, 1)
      .toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });

  // Padded to a multiple of 7 so the grid always divides into whole weeks —
  // needed to size rows evenly via gridTemplateRows for the full-height layout.
  const calDays = (): (string | null)[] => {
    const { year, month } = calMonth;
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
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

  // Swipe left/right anywhere on the date grid changes the month; a plain
  // tap (little to no movement) opens that day's detail instead. Handled at
  // the grid container level rather than per-cell, since a swipe's start
  // and end can land on different cells (or empty padding cells).
  const gridGestureStart = useRef<{ x: number; y: number; date: string | null } | null>(null);
  const SWIPE_THRESHOLD = 50;
  const TAP_THRESHOLD = 10;

  const handleGridPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const cell = (e.target as HTMLElement).closest('[data-date]') as HTMLElement | null;
    gridGestureStart.current = { x: e.clientX, y: e.clientY, date: cell?.dataset.date ?? null };
  };

  const handleGridPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = gridGestureStart.current;
    gridGestureStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) nextMonth(); else prevMonth();
      return;
    }
    if (Math.abs(dx) < TAP_THRESHOLD && Math.abs(dy) < TAP_THRESHOLD && start.date &&
      (dateMap.has(start.date) || holidayMap.has(start.date))
    ) {
      setSelectedDate(start.date);
    }
  };

  const todayStr = toDateStr(new Date());

  // ── DAY DETAIL SUB-PAGE ── (Sub-page Standard: replaces the grid in place,
  // no overlay — back chevron + leaveGuard above handle returning to it)
  if (selectedDate) {
    const holiday = holidayMap.get(selectedDate);
    const ev = dateMap.get(selectedDate);
    const details: { title: string; calendarName: string; dotColor: string; note?: string }[] = [];
    if (holiday) {
      details.push({
        title: holiday.label,
        calendarName: 'Holidays in Malaysia',
        dotColor: 'bg-orange-400',
        note: holiday.national ? undefined : 'This is not a national holiday.',
      });
    }
    if (ev) {
      details.push({ title: ev.title, calendarName: 'UMPSA Academic Calendar', dotColor: CFG[ev.type].bar });
    }

    return (
      <div className="flex flex-col h-full bg-white overflow-y-auto no-scrollbar">
        <div className="mt-4 px-4 flex items-start gap-2">
          <button
            onClick={() => setSelectedDate(null)}
            className="mt-0.5 w-7 h-7 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-90 transition shrink-0">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Academic Calendar · Day Detail</p>
            <h2 className="text-xl font-black text-slate-800">{formatDetailDate(selectedDate)}</h2>
          </div>
        </div>

        <div className="px-4 pt-4 flex flex-col gap-4" style={{ paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}>
          {details.map((d, i) => (
            <div key={i} className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-800 leading-snug">{d.title}</h3>
                <p className="text-xs font-normal text-slate-400 mt-1">{formatDetailDate(selectedDate)}</p>
                <p className="text-xs font-normal text-slate-400">All-day</p>
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3 flex items-center justify-between">
                <span className="text-xs font-normal text-slate-500">Calendar</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <span className={`w-2.5 h-2.5 rounded-full ${d.dotColor}`} />
                  {d.calendarName}
                </span>
              </div>
              {d.note && (
                <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3">
                  <p className="text-xs font-normal text-slate-500 mb-1">Notes</p>
                  <p className="text-xs font-normal text-slate-400">{d.note}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const days = calDays();
  const rows = days.length / 7;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">

      {/* Year label */}
      <div className="px-4 pt-3 pb-1 flex items-center justify-between shrink-0">
        <p className="text-sm font-bold text-slate-700">UMPSA Academic Calendar</p>
        <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
          {calYear ?? '2026/2027'}
        </span>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 pb-2 shrink-0">
        <button onClick={prevMonth}
          className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 active:scale-90 transition">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold text-slate-700">{monthLabel()}</p>
        <button onClick={nextMonth}
          className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 active:scale-90 transition">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 px-3 mb-1 shrink-0">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-slate-400">{d}</div>
        ))}
      </div>

      {/* Date grid — fills all remaining space, each week row sized equally.
          Swipe left/right anywhere here changes month; tap opens a day. */}
      <div
        className="flex-1 min-h-0 grid grid-cols-7 px-3"
        style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}
        onPointerDown={handleGridPointerDown}
        onPointerUp={handleGridPointerUp}
      >
        {days.map((dateStr, i) => {
          if (!dateStr) return <div key={i} />;
          const ev = dateMap.get(dateStr);
          const holiday = holidayMap.get(dateStr);
          const isToday   = dateStr === todayStr;
          const hasDetail = !!ev || !!holiday;

          return (
            <div key={dateStr}
              data-date={dateStr}
              className={`flex flex-col items-center pt-1.5 gap-1.5 transition-transform ${hasDetail ? 'active:scale-95' : ''}`}>
              <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm ${
                isToday ? 'bg-primary text-white font-bold' : 'text-slate-700 font-normal'
              }`}>
                {parseInt(dateStr.split('-')[2])}
              </span>
              <div className="flex items-center gap-1 h-2.5">
                {ev && <span className={`w-2.5 h-2.5 rounded-sm ${CFG[ev.type].bar}`} />}
                {holiday && <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-4 pt-3 pb-3 border-t border-slate-100 shrink-0">
        {(Object.keys(CFG) as EventType[]).map(t => (
          <span key={t} className="flex items-center gap-1.5 text-xs font-normal text-slate-500">
            <span className={`w-2.5 h-2.5 rounded-sm ${CFG[t].bar}`} />
            {CFG[t].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
          Holiday
        </span>
      </div>

      {/* Semester tabs — jump the calendar to that semester's first month */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar shrink-0">
        {semesters.map(s => (
          <button key={s.id} onPointerDown={e => { e.preventDefault(); jumpToSemester(s); }}
            className={`shrink-0 px-4 py-1.5 rounded-2xl text-xs font-semibold border transition-transform active:scale-95 ${
              activeSem === s.id
                ? `${s.bg} text-white border-transparent`
                : 'bg-white text-slate-500 border-slate-100'
            }`}>
            {s.short}
          </button>
        ))}
      </div>

    </div>
  );
};
