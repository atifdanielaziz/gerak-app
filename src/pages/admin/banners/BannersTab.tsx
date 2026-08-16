import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { ChevronLeft, Image, Megaphone, Plus, ToggleLeft, ToggleRight, Trash2, Type } from 'lucide-react';
import { NativeSelect } from '../../../components/NativeSelect';
import { useApp } from '../../../context/AppContext';
import { useLoadOnActive } from '../../../hooks/useLoadOnActive';
import { supabase } from '../../../lib/supabase';

interface Announcement {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  cta_label: string;
  cta_page: string;
  emoji: string;
  gradient: string;
  is_active: boolean;
  created_at: string;
}

type BannerMode = 'text' | 'picture';

const GRADIENTS = [
  { label: 'Green', value: 'from-emerald-700 via-emerald-600 to-teal-500' },
  { label: 'Blue', value: 'from-blue-700 via-blue-600 to-indigo-500' },
  { label: 'Orange', value: 'from-amber-500 via-orange-500 to-red-500' },
  { label: 'Purple', value: 'from-violet-600 via-purple-600 to-fuchsia-500' },
  { label: 'Navy', value: 'from-slate-800 via-slate-700 to-slate-600' },
  { label: 'Pink', value: 'from-pink-600 via-rose-500 to-red-400' },
];

const CTA_PAGES = [
  { label: 'Home', value: 'dashboard' },
  { label: 'Ride', value: 'transport' },
  { label: 'Jubah', value: 'jubah' },
  { label: 'Profile', value: 'profile' },
];

const pictureUrl = (gradient: string) => gradient?.startsWith('image:') ? gradient.slice(6) : '';

export interface BannersTabHandle { reload: () => void }
interface BannersTabProps { active: boolean; showToast: (msg: string) => void }

export const BannersTab = forwardRef<BannersTabHandle, BannersTabProps>(function BannersTab(
  { active, showToast }, ref
) {
  const { showConfirmModal } = useApp();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [mode, setMode] = useState<BannerMode>('text');
  const [tag, setTag] = useState('Announcement');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [ctaLabel, setCtaLabel] = useState('Learn More');
  const [ctaPage, setCtaPage] = useState('dashboard');
  const [emoji, setEmoji] = useState('📣');
  const [gradient, setGradient] = useState(GRADIENTS[0].value);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('announcements').select('*').order('sort_order').order('created_at', { ascending: false });
    setAnnouncements(data ?? []);
    setLoading(false);
  }, []);

  useLoadOnActive(active, loadAnnouncements);
  useImperativeHandle(ref, () => ({ reload: loadAnnouncements }), [loadAnnouncements]);

  const openNew = () => {
    setEditing(null); setMode('text'); setTag('Announcement'); setTitle(''); setSubtitle('');
    setCtaLabel('Learn More'); setCtaPage('dashboard'); setEmoji('📣');
    setGradient(GRADIENTS[0].value); setImageFile(null); setImagePreview(''); setEditorOpen(true);
  };

  const openEdit = (a: Announcement) => {
    const url = pictureUrl(a.gradient);
    setEditing(a); setMode(url ? 'picture' : 'text'); setTag(a.tag); setTitle(a.title);
    setSubtitle(a.subtitle); setCtaLabel(a.cta_label); setCtaPage(a.cta_page);
    setEmoji(a.emoji); setGradient(url ? GRADIENTS[0].value : a.gradient);
    setImageFile(null); setImagePreview(url); setEditorOpen(true);
  };

  const closeEditor = () => { setEditorOpen(false); setEditing(null); setImageFile(null); setImagePreview(''); };

  const saveBanner = async () => {
    if (!title.trim()) { showToast(mode === 'picture' ? 'Add an image description.' : 'Title is required.'); return; }
    if (mode === 'picture' && !imageFile && !imagePreview) { showToast('Choose a picture first.'); return; }
    setSaving(true);
    let visual = gradient;

    if (mode === 'picture') {
      if (imageFile) {
        if (!imageFile.type.startsWith('image/')) { showToast('Please choose an image file.'); setSaving(false); return; }
        if (imageFile.size > 8 * 1024 * 1024) { showToast('Picture must be 8 MB or smaller.'); setSaving(false); return; }
        const ext = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `announcements/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('jubah-banners').upload(path, imageFile, { contentType: imageFile.type, upsert: false });
        if (uploadError) { showToast(uploadError.message); setSaving(false); return; }
        visual = `image:${supabase.storage.from('jubah-banners').getPublicUrl(path).data.publicUrl}`;
      } else {
        visual = `image:${imagePreview}`;
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      tag: tag.trim(), title: title.trim(), subtitle: subtitle.trim(), cta_label: ctaLabel.trim(),
      cta_page: ctaPage, emoji: emoji.trim(), gradient: visual, is_active: editing?.is_active ?? true,
    };
    const query = editing
      ? supabase.from('announcements').update(payload).eq('id', editing.id)
      : supabase.from('announcements').insert({ ...payload, created_by: user?.id });
    const { error } = await query;
    setSaving(false);
    if (error) { showToast(error.message); return; }
    showToast(editing ? 'Advertisement updated.' : 'Advertisement published.');
    closeEditor(); loadAnnouncements();
  };

  const toggleBanner = async (a: Announcement) => {
    await supabase.from('announcements').update({ is_active: !a.is_active }).eq('id', a.id);
    loadAnnouncements();
  };
  const deleteBanner = async (id: string) => {
    await supabase.from('announcements').delete().eq('id', id);
    showToast('Advertisement deleted.'); loadAnnouncements();
  };

  const preview = (compact = false) => {
    const url = mode === 'picture' ? imagePreview : '';
    return (
      <div className={`relative overflow-hidden rounded-2xl border border-slate-100 aspect-[2.15/1] ${url ? 'bg-slate-50' : `bg-gradient-to-br ${gradient}`}`}>
        {url ? <img src={url} alt={title || 'Advertisement preview'} className="w-full h-full object-cover" /> : (
          <div className={`absolute inset-0 p-4 text-white flex flex-col items-center justify-center text-center ${compact ? 'gap-0.5' : 'gap-1'}`}>
            <div className="absolute -right-3 -top-3 text-7xl opacity-10">{emoji}</div>
            <span className="bg-white/15 border border-white/20 rounded-xl px-2 py-0.5 text-xs font-semibold">{tag || 'Announcement'}</span>
            <h4 className={`${compact ? 'text-sm' : 'text-base'} font-semibold leading-tight m-0 max-w-[90%] line-clamp-2`}>{title || 'Your advertisement title'}</h4>
            {!!subtitle && <p className="text-xs text-white/80 font-normal line-clamp-2 max-w-[90%]">{subtitle}</p>}
          </div>
        )}
      </div>
    );
  };

  if (editorOpen) {
    return (
      <div className="flex flex-col gap-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
        <button type="button" onPointerDown={e => { e.preventDefault(); closeEditor(); }} className="self-start flex items-center gap-1 text-xs font-semibold text-slate-500 active:scale-[0.99] transition-transform transform-gpu">
          <ChevronLeft className="w-4 h-4" /> All advertisements
        </button>
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Megaphone className="w-4 h-4 text-slate-400" /> {editing ? 'Edit Advertisement' : 'New Advertisement'}</h3>
            <p className="text-xs font-normal text-slate-400 mt-1">Published content is centred on the home banner.</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(['text', 'picture'] as BannerMode[]).map(value => (
              <button key={value} type="button" onPointerDown={e => { e.preventDefault(); setMode(value); }} className={`bg-white border rounded-2xl p-3 flex items-center gap-2 text-xs font-semibold active:bg-slate-50 active:scale-[0.99] transition-transform transform-gpu ${mode === value ? 'border-slate-900' : 'border-slate-100'}`}>
                {value === 'text' ? <Type className="w-4 h-4 text-slate-400" /> : <Image className="w-4 h-4 text-slate-400" />}
                {value === 'text' ? 'Text / Number' : 'Picture'}
              </button>
            ))}
          </div>

          {mode === 'picture' && (
            <label className="bg-white border border-dashed border-slate-200 rounded-2xl p-4 flex flex-col items-center gap-1 cursor-pointer active:bg-slate-50">
              <Image className="w-5 h-5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-600">Choose landscape picture</span>
              <span className="text-xs font-normal text-slate-400">Recommended ratio 2.15:1 · maximum 8 MB</span>
              <input type="file" accept="image/*" className="hidden" onChange={e => {
                const file = e.target.files?.[0] ?? null;
                setImageFile(file);
                if (file) setImagePreview(URL.createObjectURL(file));
              }} />
            </label>
          )}

          {mode === 'text' && <>
            <label className="flex flex-col gap-1 text-xs font-normal text-slate-400">Tag<input value={tag} onChange={e => setTag(e.target.value)} className="bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-slate-900" /></label>
            <label className="flex flex-col gap-1 text-xs font-normal text-slate-400">Decorative symbol<input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={4} className="w-20 bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:border-slate-900" /></label>
          </>}

          <label className="flex flex-col gap-1 text-xs font-normal text-slate-400">{mode === 'picture' ? 'Image description / admin label' : 'Title'} <span className="text-red-400">*</span><input value={title} onChange={e => setTitle(e.target.value)} className="bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-slate-900" /></label>
          {mode === 'text' && <label className="flex flex-col gap-1 text-xs font-normal text-slate-400">Subtitle<textarea value={subtitle} onChange={e => setSubtitle(e.target.value)} rows={2} className="bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-slate-900 resize-none" /></label>}

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-normal text-slate-400">Action label<input value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} className="bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-slate-900" /></label>
            <div className="flex flex-col gap-1"><span className="text-xs font-normal text-slate-400">Opens page</span><NativeSelect value={ctaPage} onChange={setCtaPage} options={CTA_PAGES} label="Opens page" /></div>
          </div>

          {mode === 'text' && <div className="flex flex-col gap-2"><span className="text-xs font-normal text-slate-400">Background colour</span><div className="grid grid-cols-3 gap-2">{GRADIENTS.map(g => <button key={g.value} type="button" onPointerDown={e => { e.preventDefault(); setGradient(g.value); }} className={`bg-gradient-to-r ${g.value} text-white rounded-xl py-2 text-xs font-semibold border-2 ${gradient === g.value ? 'border-slate-900' : 'border-transparent'}`}>{g.label}</button>)}</div></div>}

          <div><p className="text-xs font-normal text-slate-400 mb-2">Preview</p>{preview()}</div>
          <button type="button" onPointerDown={e => { e.preventDefault(); if (!saving) saveBanner(); }} disabled={saving} className="bg-primary text-white rounded-2xl py-3 text-xs font-semibold disabled:opacity-50 active:scale-[0.99] transition-transform transform-gpu">{saving ? 'Saving…' : editing ? 'Save Changes' : 'Publish Advertisement'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onPointerDown={e => { e.preventDefault(); openNew(); }} className="flex items-center justify-center gap-2 bg-primary text-white font-semibold text-xs py-3 rounded-2xl active:scale-[0.99] transition-transform transform-gpu"><Plus className="w-4 h-4" /> New Advertisement</button>
      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Megaphone className="w-4 h-4 text-slate-400" /> All Banners</h3>
        {loading ? <div className="flex justify-center py-8"><span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" /></div> : announcements.length === 0 ? <p className="text-xs text-slate-400 font-normal text-center py-6">No advertisements yet.</p> : (
          <div className="flex flex-col gap-4">{announcements.map(a => {
            const url = pictureUrl(a.gradient);
            return <div key={a.id} role="button" tabIndex={0} onClick={() => openEdit(a)} onKeyDown={e => { if (e.key === 'Enter') openEdit(a); }} className={`rounded-2xl border border-slate-100 p-4 flex flex-col gap-3 cursor-pointer active:bg-slate-50 active:scale-[0.99] transition-transform transform-gpu ${a.is_active ? 'bg-white' : 'bg-slate-50 opacity-60'}`}>
              <div className={`relative overflow-hidden rounded-xl aspect-[2.15/1] ${url ? 'bg-slate-50' : `bg-gradient-to-br ${a.gradient}`}`}>
                {url ? <img src={url} alt={a.title} className="w-full h-full object-cover" /> : <div className="absolute inset-0 p-3 text-white flex flex-col items-center justify-center text-center"><span className="text-xs font-semibold opacity-80">{a.tag}</span><p className="text-sm font-semibold line-clamp-2">{a.title}</p></div>}
              </div>
              <div><p className="text-xs font-semibold text-slate-700">{a.title}</p><p className="text-xs font-normal text-slate-400 mt-0.5">{url ? 'Picture advertisement' : 'Text / number advertisement'} · {new Date(a.created_at).toLocaleDateString('en-MY')}</p></div>
              <div className="flex gap-2">
                <button type="button" onPointerDown={e => { e.preventDefault(); e.stopPropagation(); toggleBanner(a); }} className={`flex-1 flex items-center justify-center gap-1.5 font-semibold text-xs py-2 rounded-xl border ${a.is_active ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-white border-slate-100 text-slate-500'}`}>{a.is_active ? <><ToggleRight className="w-4 h-4" /> Active</> : <><ToggleLeft className="w-4 h-4" /> Inactive</>}</button>
                <button type="button" onPointerDown={e => { e.preventDefault(); e.stopPropagation(); showConfirmModal({ title: 'Delete Advertisement?', message: `This removes “${a.title}”. This cannot be undone.`, confirmLabel: 'DELETE', onConfirm: () => deleteBanner(a.id) }); }} className="px-3 bg-red-50 border border-red-100 text-red-500 rounded-xl"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>;
          })}</div>
        )}
      </div>
    </div>
  );
});
