import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardPaste, Eye, EyeOff, GraduationCap, Minus, MoreVertical, Pencil, Save, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useApp } from '../../../context/AppContext';
import { useAxisLockedScroll } from '../../../hooks/useAxisLockedScroll';

type FacultyRow = { id: string; name: string; sort_order: number; is_active: boolean };

const parseFacultyList = (text: string): string[] => {
  const lines = text.replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean);
  const hasNumberedItems = lines.some(line => /^\d+[.)]\s*/.test(line));
  if (!hasNumberedItems) return lines.map(line => line.replace(/^[-•]\s*/, '').trim()).filter(Boolean);

  const items: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\d+[.)]\s*(.*)$/);
    if (match) {
      if (match[1].trim()) items.push(match[1].trim());
    } else if (items.length) {
      // Messaging apps often wrap a long faculty name onto another line.
      // A continuation without a new number belongs to the preceding item.
      items[items.length - 1] = `${items[items.length - 1]} ${line}`.trim();
    }
  }
  return items;
};

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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<string[]>(['']);
  const [bulkSaving, setBulkSaving] = useState(false);
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

  const handleBulkPaste = (text: string) => {
    const parsed = parseFacultyList(text);
    if (parsed.length) setBulkRows([...parsed, '']);
  };

  const saveBulk = async () => {
    const existing = new Set(rows.map(row => row.name.trim().toLocaleLowerCase()));
    const unique = [...new Map(
      bulkRows.map(name => name.trim()).filter(Boolean).map(name => [name.toLocaleLowerCase(), name])
    ).values()].filter(name => !existing.has(name.toLocaleLowerCase()));
    if (!unique.length) { showToast('No new faculties to add.'); return; }
    const firstOrder = rows.length ? Math.max(...rows.map(row => row.sort_order)) + 1 : 0;
    setBulkSaving(true);
    const { error } = await supabase.from('jubah_faculties').insert(unique.map((name, index) => ({
      university_key: universityKey, name, sort_order: firstOrder + index,
    })));
    setBulkSaving(false);
    if (error) { showToast('The faculty list could not be saved.'); return; }
    setBulkOpen(false); setBulkRows(['']);
    showToast(`${unique.length} ${unique.length === 1 ? 'faculty' : 'faculties'} added.`);
    await load();
  };

  if (!active) return null;
  return <section className="border border-slate-100 rounded-3xl p-4 bg-white pb-5 mb-24">
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2.5">
        <GraduationCap className="w-5 h-5 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-800">Faculty</h3>
      </div>
      <button type="button" data-axis-lock-ignore aria-label="Add faculties in bulk"
        onPointerDown={e => { e.preventDefault(); setBulkRows(['']); setBulkOpen(true); }}
        className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-500 active:bg-slate-50 transition-transform transform-gpu active:scale-[0.99]">
        <ClipboardPaste className="w-4 h-4" />
      </button>
    </div>
    <div ref={tableScrollRef} className="table-scroll-x relative w-full max-w-full overflow-x-auto overscroll-none" style={{ contain: 'layout paint' }}>
      <div data-axis-y className="max-h-[28rem] overflow-y-auto overscroll-none no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
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
    {bulkOpen && createPortal(
      <div className="fixed inset-0 z-[9997] flex items-center justify-center p-5 bg-slate-900/45" onPointerDown={e => { if (e.target === e.currentTarget) setBulkOpen(false); }}>
        <section className="w-full max-w-lg max-h-[calc(100dvh-6rem)] bg-white border border-slate-100 rounded-3xl overflow-hidden flex flex-col shadow-xl">
          <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5 min-w-0">
              <ClipboardPaste className="w-5 h-5 text-slate-400 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-800">Bulk Faculty List</h3>
                <p className="text-xs font-normal text-slate-400 truncate">{universityLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={bulkSaving || !bulkRows.some(name => name.trim())}
                onPointerDown={e => { e.preventDefault(); void saveBulk(); }}
                className="h-9 px-3 flex items-center gap-1.5 rounded-xl bg-primary border border-primary text-white text-xs font-semibold disabled:opacity-40 transition-transform transform-gpu active:scale-[0.99]">
                <Save className="w-3.5 h-3.5" /> {bulkSaving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onPointerDown={e => { e.preventDefault(); setBulkOpen(false); }} aria-label="Close bulk faculty list"
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 active:scale-90 transition-transform transform-gpu">
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-2 no-scrollbar">
            <table className="w-full border-collapse text-left">
              <tbody>
                {bulkRows.map((name, index) => <tr key={index} className="border-b border-slate-100">
                  <td className="w-12 py-3 px-2 text-xs font-normal text-slate-400 align-top">{index + 1}</td>
                  <td className="py-3 px-2">
                    <input autoFocus={index === 0} value={name}
                      onPaste={e => { e.preventDefault(); handleBulkPaste(e.clipboardData.getData('text')); }}
                      onChange={e => {
                        const next = [...bulkRows]; next[index] = e.target.value;
                        if (index === next.length - 1 && e.target.value.trim()) next.push('');
                        setBulkRows(next);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const next = [...bulkRows];
                          if (index === next.length - 1) next.push('');
                          setBulkRows(next);
                        }
                      }}
                      placeholder={index === 0 ? 'Paste or type a faculty list' : ''}
                      className="w-full bg-transparent border-0 p-0 text-xs font-semibold text-slate-800 outline-none placeholder:font-normal placeholder:text-slate-300" />
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>
      </div>, document.body
    )}
  </section>;
}
