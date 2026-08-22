import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, Minus, MoreVertical, Pencil } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useApp } from '../../../context/AppContext';
import { useAxisLockedScroll } from '../../../hooks/useAxisLockedScroll';

type FacultyRow = { id: string; name: string; sort_order: number; is_active: boolean };

function FacultyActions({ row, busy, onEdit, onToggle, onRemove }: {
  row: FacultyRow; busy: boolean; onEdit: () => void; onToggle: () => void; onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });

  return <div data-axis-lock-ignore className="relative" onClick={e => e.stopPropagation()}>
    <button type="button" disabled={busy} aria-label={`Actions for ${row.name}`}
      onPointerDown={e => {
        e.preventDefault(); e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setPosition({ top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 132)), right: Math.max(8, window.innerWidth - rect.right) });
        setOpen(value => !value);
      }}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 active:scale-90 transition-transform transform-gpu disabled:opacity-40">
      <MoreVertical className="w-4 h-4" />
    </button>
    {open && createPortal(<>
      <div className="fixed inset-0 z-[9998]" onPointerDown={e => { e.preventDefault(); setOpen(false); }} />
      <div data-axis-lock-ignore className="fixed z-[9999] min-w-[185px] overflow-hidden bg-white border border-slate-100 rounded-2xl shadow-xl"
        style={{ top: position.top, right: position.right }}>
        <button type="button" onPointerDown={e => { e.preventDefault(); setOpen(false); onEdit(); }}
          className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold text-slate-600 active:bg-slate-50 transition-transform transform-gpu active:scale-[0.99]">
          <Pencil className="w-4 h-4" /> Edit
        </button>
        <button type="button" onPointerDown={e => { e.preventDefault(); setOpen(false); onToggle(); }}
          className="w-full flex items-center gap-3 px-4 py-3 border-t border-slate-100 text-left text-xs font-semibold text-slate-600 active:bg-slate-50 transition-transform transform-gpu active:scale-[0.99]">
          {row.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {row.is_active ? 'Hide' : 'Show'}
        </button>
        <button type="button" onPointerDown={e => { e.preventDefault(); setOpen(false); onRemove(); }}
          className="w-full flex items-center gap-3 px-4 py-3 border-t border-slate-100 text-left text-xs font-semibold text-red-500 active:bg-red-50 transition-transform transform-gpu active:scale-[0.99]">
          <Minus className="w-4 h-4" /> Remove
        </button>
      </div>
    </>, document.body)}
  </div>;
}

export function JubahFacultySubTab({ active, universityKey, universityLabel, showToast }: {
  active: boolean; universityKey: string; universityLabel: string; showToast: (message: string) => void;
}) {
  const { showConfirmModal } = useApp();
  const tableScrollRef = useAxisLockedScroll<HTMLDivElement>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<FacultyRow[]>([]);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('jubah_faculties')
      .select('id,name,sort_order,is_active').eq('university_key', universityKey)
      .order('sort_order').order('name');
    if (error) { showToast('Unable to load the faculty directory.'); return; }
    setRows((data ?? []) as FacultyRow[]);
  }, [showToast, universityKey]);

  useEffect(() => { if (active) void load(); }, [active, load]);
  useEffect(() => { setNewName(''); setEditingId(null); setEditName(''); }, [universityKey]);

  const add = async () => {
    const name = newName.trim();
    if (!name || busy === 'add') return;
    setBusy('add');
    const { error } = await supabase.from('jubah_faculties').insert({
      university_key: universityKey,
      name,
      sort_order: rows.length ? Math.max(...rows.map(row => row.sort_order)) + 1 : 0,
    });
    setBusy(null);
    if (error) {
      showToast(error.code === '23505' ? 'That faculty is already listed.' : 'Faculty could not be added.');
      return;
    }
    setNewName('');
    showToast('Faculty added.');
    await load();
    inputRef.current?.focus();
  };

  const toggle = async (row: FacultyRow) => {
    setBusy(row.id);
    const { error } = await supabase.from('jubah_faculties').update({ is_active: !row.is_active }).eq('id', row.id);
    setBusy(null);
    if (error) { showToast('Faculty status could not be changed.'); return; }
    showToast(row.is_active ? 'Faculty hidden from new bookings.' : 'Faculty restored to the booking form.');
    await load();
  };

  const saveEdit = async (row: FacultyRow) => {
    const name = editName.trim();
    if (!name) { setEditingId(null); setEditName(''); return; }
    if (name === row.name) { setEditingId(null); setEditName(''); return; }
    setBusy(row.id);
    const { error } = await supabase.from('jubah_faculties').update({ name }).eq('id', row.id);
    setBusy(null);
    if (error) {
      showToast(error.code === '23505' ? 'That faculty is already listed.' : 'Faculty could not be updated.');
      return;
    }
    setEditingId(null); setEditName('');
    showToast('Faculty updated.');
    await load();
  };

  const remove = async (row: FacultyRow) => {
    const { error } = await supabase.from('jubah_faculties').delete().eq('id', row.id);
    if (error) {
      showToast(error.message.includes('historical') ? 'This faculty has bookings. Hide it instead.' : 'Faculty could not be removed.');
      return;
    }
    showToast('Faculty removed.');
    await load();
  };

  if (!active) return null;
  return <section className="border border-slate-100 rounded-3xl p-4 bg-white pb-5 mb-24">
    <div ref={tableScrollRef} className="table-scroll-x relative w-full max-w-full overflow-x-auto overscroll-none" style={{ contain: 'layout paint' }}>
      <div data-axis-y className="max-h-[600px] overflow-y-auto overscroll-none no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="w-full min-w-[22rem] border-collapse text-left">
          <thead><tr className="border-b border-slate-100">
            <th className="sticky top-0 bg-white w-14 py-2 px-3 text-xs font-semibold text-slate-400">No.</th>
            <th className="sticky top-0 bg-white py-2 px-3 text-xs font-semibold text-slate-400">Faculty</th>
            <th className="sticky top-0 bg-white w-12 py-2 px-1"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {rows.map((row, index) => <tr key={row.id} className="border-b border-slate-100">
              <td className="py-3 px-3 text-xs font-normal text-slate-500">{index + 1}</td>
              <td className="py-3 px-3">
                {editingId === row.id ? (
                  <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                    onBlur={() => void saveEdit(row)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                      if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); setEditName(''); }
                    }}
                    disabled={busy === row.id}
                    className="w-full bg-transparent border-0 p-0 text-xs font-semibold text-slate-800 outline-none placeholder:text-slate-300 disabled:opacity-50" />
                ) : (
                  <span className={`text-xs font-semibold ${row.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{row.name}</span>
                )}
              </td>
              <td className="py-2 px-1 text-right">
                <FacultyActions row={row} busy={busy === row.id}
                  onEdit={() => { setEditingId(row.id); setEditName(row.name); }}
                  onToggle={() => void toggle(row)}
                  onRemove={() => showConfirmModal({ title: 'Remove faculty?', message: `Remove “${row.name}” from ${universityLabel}?`, confirmLabel: 'REMOVE', onConfirm: () => void remove(row) })} />
              </td>
            </tr>)}
            <tr>
              <td className="py-3 px-3 text-xs font-normal text-slate-400">{rows.length + 1}</td>
              <td className="py-3 px-3" colSpan={2}>
                <input ref={inputRef} value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
                  disabled={busy === 'add'} placeholder="Type a new faculty and press Enter"
                  className="w-full bg-transparent border-0 p-0 text-xs font-semibold text-slate-800 outline-none placeholder:font-normal placeholder:text-slate-300 disabled:opacity-50" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>;
}
