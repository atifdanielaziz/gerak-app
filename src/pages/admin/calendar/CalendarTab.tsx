import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { CalendarDays, Upload, Eye, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { useLoadOnActive } from '../../../hooks/useLoadOnActive';
import { UNIVERSITY_MAP } from '../../../lib/universities';

export interface CalendarTabHandle {
  reload: () => void;
}

interface CalendarTabProps {
  active: boolean;
  showToast: (msg: string) => void;
  universityKey: string;
}

// Academic calendar PDF upload + AI-assisted parsing — split out of
// AdminHome.tsx. No modal-tracking entanglement: the parsed preview renders
// inline in the tab, not as an overlay sheet.
export const CalendarTab = forwardRef<CalendarTabHandle, CalendarTabProps>(function CalendarTab(
  { active, showToast, universityKey },
  ref
) {
  const calUploadRef = useRef<HTMLInputElement>(null);
  const [calParsing, setCalParsing] = useState(false);
  const [calParsed, setCalParsed] = useState<any>(null);
  const [calSaving, setCalSaving] = useState(false);
  const [calActiveYear, setCalActiveYear] = useState<string | null>(null);
  const [calPreviewSem, setCalPreviewSem] = useState(0);

  const loadActiveCalendar = useCallback(async () => {
    const { data } = await supabase
      .from('academic_calendars')
      .select('academic_year')
      .eq('is_active', true)
      .eq('university', UNIVERSITY_MAP[universityKey]?.shortLabel ?? universityKey.toUpperCase())
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setCalActiveYear(data?.academic_year ?? null);
  }, [universityKey]);

  useLoadOnActive(active, loadActiveCalendar);
  useImperativeHandle(ref, () => ({ reload: loadActiveCalendar }), [loadActiveCalendar]);

  const handleCalendarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setCalParsing(true);
    setCalParsed(null);
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      const { data, error } = await supabase.functions.invoke('parse-calendar', { body: formData });
      if (error) throw error;
      setCalParsed(data);
      setCalPreviewSem(0);
    } catch {
      showToast('Failed to parse PDF. Please try again.');
    } finally {
      setCalParsing(false);
    }
  };

  const handleCalendarSave = async () => {
    if (!calParsed) return;
    setCalSaving(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      await supabase.from('academic_calendars')
        .update({ is_active: false })
        .eq('university', UNIVERSITY_MAP[universityKey]?.shortLabel ?? universityKey.toUpperCase())
        .eq('academic_year', calParsed.academic_year);
      const { error } = await supabase.from('academic_calendars').insert({
        academic_year: calParsed.academic_year,
        university: UNIVERSITY_MAP[universityKey]?.shortLabel ?? universityKey.toUpperCase(),
        semesters: calParsed.semesters,
        holidays: calParsed.holidays ?? [],
        uploaded_by: authUser?.id,
        is_active: true,
      });
      if (error) throw error;
      showToast(`Calendar ${calParsed.academic_year} saved & activated!`);
      setCalParsed(null);
      setCalActiveYear(calParsed.academic_year);
    } catch {
      showToast('Failed to save calendar.');
    } finally {
      setCalSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">

      {/* Current status */}
      <div className={`rounded-2xl p-5 flex items-center gap-3 ${calActiveYear ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100'}`}>
        <CalendarDays className={`w-5 h-5 shrink-0 ${calActiveYear ? 'text-emerald-500' : 'text-slate-400'}`} />
        <div>
          <p className="text-xs font-semibold text-slate-700">Active Calendar</p>
          <p className={`text-xs font-semibold ${calActiveYear ? 'text-emerald-600' : 'text-slate-400'}`}>
            {calActiveYear ? `${UNIVERSITY_MAP[universityKey]?.shortLabel ?? universityKey.toUpperCase()} ${calActiveYear}` : 'No calendar uploaded yet'}
          </p>
        </div>
      </div>

      {/* Upload section */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-700">Upload New Calendar PDF</p>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">Claude AI will parse the PDF and extract all semester events automatically.</p>
        </div>

        <input ref={calUploadRef} type="file" accept="application/pdf" className="hidden" onChange={handleCalendarUpload} />

        <button onClick={() => calUploadRef.current?.click()} disabled={calParsing}
          className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-slate-200 rounded-xl py-3 text-slate-500 hover:border-slate-300 hover:text-slate-700 hover:bg-slate-50 transition text-xs font-semibold disabled:opacity-50">
          {calParsing ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-primary animate-spin" />
              Parsing with AI… please wait
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Choose PDF to Upload
            </>
          )}
        </button>

        {/* Parsed preview */}
        {calParsed && (
          <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" />
                <p className="text-xs font-semibold text-slate-700">Preview — {calParsed.academic_year}</p>
              </div>
              <button onClick={() => setCalParsed(null)} className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 active:scale-90">
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* Semester mini-tabs */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {calParsed.semesters?.map((s: any, i: number) => (
                // Two stacked layers instead of toggling bg-primary directly —
                // this WebView unreliably repaints colour changes; opacity
                // changes repaint reliably, so only opacity is toggled here.
                <button key={s.id} onPointerDown={e => { e.preventDefault(); setCalPreviewSem(i); }}
                  className="relative shrink-0 rounded-xl transition-transform transform-gpu">
                  <span className="block px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-500">{s.short}</span>
                  <span
                    className={`absolute inset-0 flex items-center justify-center rounded-xl bg-primary text-white text-xs font-semibold transition-opacity duration-150 ${
                      calPreviewSem === i ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                  >
                    {s.short}
                  </span>
                </button>
              ))}
            </div>

            {/* Events list */}
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto no-scrollbar">
              {calParsed.semesters?.[calPreviewSem]?.events?.map((ev: any, i: number) => (
                <div key={i} className="bg-slate-50 rounded-xl px-3 py-2.5 flex items-start justify-between gap-2">
                  <div>
                    <span className={`text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full mr-1.5 ${
                      ev.type === 'exam'         ? 'bg-red-100 text-red-600' :
                      ev.type === 'study'        ? 'bg-amber-100 text-amber-600' :
                      ev.type === 'break'        ? 'bg-slate-200 text-slate-500' :
                      ev.type === 'lectures'     ? 'bg-emerald-100 text-emerald-600' :
                      ev.type === 'orientation'  ? 'bg-purple-100 text-purple-600' :
                                                   'bg-blue-100 text-blue-600'
                    }`}>{ev.type}</span>
                    <span className="text-xs font-semibold text-slate-700">{ev.title}</span>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">{ev.date}</p>
                  </div>
                  {ev.duration && <span className="text-xs bg-white border border-slate-100 text-slate-400 font-semibold px-1.5 py-0.5 rounded-full shrink-0">{ev.duration}</span>}
                </div>
              ))}
            </div>

            {/* Holidays count */}
            <p className="text-xs text-slate-400 font-semibold">
              {calParsed.holidays?.length ?? 0} public holidays / special dates detected
            </p>

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={handleCalendarSave} disabled={calSaving}
                className="flex-1 bg-primary text-white text-xs font-semibold py-3 rounded-2xl active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {calSaving
                  ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> Saving…</>
                  : <><CheckCircle2 className="w-4 h-4" /> Confirm & Activate</>}
              </button>
              <button onClick={() => setCalParsed(null)}
                className="px-4 bg-slate-100 text-slate-500 text-xs font-semibold py-3 rounded-2xl active:scale-95 transition">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex gap-2 items-start">
        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-700 font-semibold leading-relaxed flex flex-col gap-0.5">
          <p className="font-semibold">How to update the calendar:</p>
          <p>1. Download the latest {UNIVERSITY_MAP[universityKey]?.shortLabel ?? universityKey.toUpperCase()} Academic Calendar PDF from the university website.</p>
          <p>2. Tap "Choose PDF to Upload".</p>
          <p>3. Wait for AI parsing (~10–15 seconds).</p>
          <p>4. Review the extracted events, then tap "Confirm & Activate".</p>
        </div>
      </div>
    </div>
  );
});
