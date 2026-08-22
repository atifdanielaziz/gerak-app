import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, GraduationCap, Plus, Save, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useApp } from '../../../context/AppContext';

type FacultyRow = { id: string; name: string; sort_order: number; is_active: boolean };

export function JubahFacultySubTab({ active, universityKey, universityLabel, showToast }: {
  active: boolean; universityKey: string; universityLabel: string; showToast: (message: string) => void;
}) {
  const { showConfirmModal } = useApp();
  const [rows, setRows] = useState<FacultyRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('jubah_faculties')
      .select('id,name,sort_order,is_active').eq('university_key', universityKey)
      .order('sort_order').order('name');
    if (error) { showToast('Unable to load the faculty directory.'); return; }
    const next = (data ?? []) as FacultyRow[];
    setRows(next); setDrafts(Object.fromEntries(next.map(row => [row.id, row.name])));
  }, [showToast, universityKey]);

  useEffect(() => { if (active) void load(); }, [active, load]);

  const add = async () => {
    const name = newName.trim(); if (!name) return;
    setBusy('add');
    const { error } = await supabase.from('jubah_faculties').insert({
      university_key: universityKey, name, sort_order: rows.length ? Math.max(...rows.map(r => r.sort_order)) + 1 : 0,
    });
    setBusy(null);
    if (error) { showToast(error.code === '23505' ? 'That faculty is already listed.' : 'Faculty could not be added.'); return; }
    setNewName(''); showToast('Faculty added.'); await load();
  };

  const saveName = async (row: FacultyRow) => {
    const name = (drafts[row.id] ?? '').trim(); if (!name || name === row.name) return;
    setBusy(row.id);
    const { error } = await supabase.from('jubah_faculties').update({ name }).eq('id', row.id);
    setBusy(null);
    if (error) { showToast(error.code === '23505' ? 'That faculty is already listed.' : 'Faculty could not be renamed.'); return; }
    showToast('Faculty name saved.'); await load();
  };

  const toggle = async (row: FacultyRow) => {
    setBusy(row.id);
    const { error } = await supabase.from('jubah_faculties').update({ is_active: !row.is_active }).eq('id', row.id);
    setBusy(null);
    if (error) { showToast('Faculty status could not be changed.'); return; }
    showToast(row.is_active ? 'Faculty hidden from new bookings.' : 'Faculty restored to the booking form.'); await load();
  };

  const move = async (index: number, direction: -1 | 1) => {
    const otherIndex = index + direction; if (otherIndex < 0 || otherIndex >= rows.length) return;
    const a = rows[index], b = rows[otherIndex]; setBusy(a.id);
    const [first, second] = await Promise.all([
      supabase.from('jubah_faculties').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('jubah_faculties').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
    setBusy(null);
    if (first.error || second.error) { showToast('Faculty order could not be changed.'); return; }
    await load();
  };

  const remove = async (row: FacultyRow) => {
    const { error } = await supabase.from('jubah_faculties').delete().eq('id', row.id);
    if (error) { showToast(error.message.includes('historical') ? 'This faculty has bookings. Deactivate it instead.' : 'Faculty could not be removed.'); return; }
    showToast('Faculty removed.'); await load();
  };

  if (!active) return null;
  return <div className="flex flex-col gap-4 pb-24">
    <section className="border border-slate-100 rounded-3xl p-4 bg-white">
      <div className="flex items-start gap-3 mb-4">
        <GraduationCap className="w-5 h-5 text-slate-400 mt-0.5" />
        <div><h3 className="text-sm font-semibold text-slate-800">Faculty Directory ({universityLabel})</h3>
          <p className="text-xs font-normal text-slate-400 mt-1">Active faculties appear in this university’s Jubah booking form.</p></div>
      </div>
      <div className="flex gap-2">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Faculty name or abbreviation"
          className="min-w-0 flex-1 bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-slate-900" />
        <button type="button" disabled={!newName.trim() || busy === 'add'} onPointerDown={e => { e.preventDefault(); void add(); }}
          className="px-4 rounded-xl bg-primary text-white disabled:opacity-40 transition-transform transform-gpu active:scale-[0.99]" aria-label="Add faculty">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </section>
    <section className="border border-slate-100 rounded-3xl p-4 bg-white flex flex-col gap-3">
      {rows.length === 0 && <p className="py-8 text-center text-xs font-normal text-slate-400">No faculties configured for {universityLabel} yet.</p>}
      {rows.map((row, index) => {
        const dirty = (drafts[row.id] ?? '') !== row.name;
        return <div key={row.id} className="border border-slate-100 rounded-2xl p-3 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input value={drafts[row.id] ?? ''} onChange={e => setDrafts(d => ({ ...d, [row.id]: e.target.value }))}
              className="min-w-0 flex-1 bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-slate-900" />
            <button type="button" disabled={!dirty || busy === row.id} onPointerDown={e => { e.preventDefault(); void saveName(row); }}
              className={`w-10 h-10 rounded-xl border flex items-center justify-center ${dirty ? 'bg-primary border-primary text-white' : 'bg-white border-slate-100 text-slate-300'}`} aria-label="Save faculty name"><Save className="w-4 h-4" /></button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs font-semibold ${row.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>{row.is_active ? 'Active' : 'Hidden'}</span>
            <div className="flex gap-1.5">
              <button type="button" disabled={index === 0 || busy === row.id} onClick={() => void move(index, -1)} className="w-9 h-9 border border-slate-100 rounded-xl flex items-center justify-center disabled:opacity-30" aria-label="Move up"><ArrowUp className="w-4 h-4" /></button>
              <button type="button" disabled={index === rows.length - 1 || busy === row.id} onClick={() => void move(index, 1)} className="w-9 h-9 border border-slate-100 rounded-xl flex items-center justify-center disabled:opacity-30" aria-label="Move down"><ArrowDown className="w-4 h-4" /></button>
              <button type="button" disabled={busy === row.id} onClick={() => void toggle(row)} className="w-9 h-9 border border-slate-100 rounded-xl flex items-center justify-center" aria-label={row.is_active ? 'Hide faculty' : 'Show faculty'}>{row.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</button>
              <button type="button" onClick={() => showConfirmModal({ title: 'Remove faculty?', message: `Remove “${row.name}” from ${universityLabel}?`, confirmLabel: 'REMOVE', onConfirm: () => void remove(row) })} className="w-9 h-9 border border-red-100 text-red-500 rounded-xl flex items-center justify-center" aria-label="Remove faculty"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>;
      })}
    </section>
  </div>;
}
