import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { Plus, Megaphone, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { NativeSelect } from '../../../components/NativeSelect';
import { useLoadOnActive } from '../../../hooks/useLoadOnActive';
import { useApp } from '../../../context/AppContext';

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

const GRADIENTS = [
  { label: 'Green',  value: 'from-emerald-700 via-emerald-600 to-teal-500' },
  { label: 'Blue',   value: 'from-blue-700 via-blue-600 to-indigo-500' },
  { label: 'Orange', value: 'from-amber-500 via-orange-500 to-red-500' },
  { label: 'Purple', value: 'from-violet-600 via-purple-600 to-fuchsia-500' },
  { label: 'Navy',   value: 'from-slate-800 via-slate-700 to-slate-600' },
  { label: 'Pink',   value: 'from-pink-600 via-rose-500 to-red-400' },
];

const CTA_PAGES = [
  { label: 'Home',    value: 'dashboard' },
  { label: 'Ride',    value: 'transport' },
  { label: 'Jubah',   value: 'jubah' },
  { label: 'Profile', value: 'profile' },
];

export interface BannersTabHandle {
  reload: () => void;
}

interface BannersTabProps {
  active: boolean;
  showToast: (msg: string) => void;
}

// General site-wide announcement banners (shown on the customer dashboard) —
// split out of AdminHome.tsx. Not to be confused with the per-university
// Jubah promo banners (JubahBannerSubTab) — different feature that happens
// to share the word "banner"; this one manages the `announcements` table.
export const BannersTab = forwardRef<BannersTabHandle, BannersTabProps>(function BannersTab(
  { active, showToast },
  ref
) {
  const { showConfirmModal } = useApp();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [bannersLoading, setBannersLoading] = useState(false);
  const [showBannerForm, setShowBannerForm] = useState(false);
  const [savingBanner, setSavingBanner]     = useState(false);
  const [bannerTag, setBannerTag]           = useState('📢 Announcement');
  const [bannerTitle, setBannerTitle]       = useState('');
  const [bannerSubtitle, setBannerSubtitle] = useState('');
  const [bannerCtaLabel, setBannerCtaLabel] = useState('Learn More');
  const [bannerCtaPage, setBannerCtaPage]   = useState('dashboard');
  const [bannerEmoji, setBannerEmoji]       = useState('📣');
  const [bannerGradient, setBannerGradient] = useState(GRADIENTS[0].value);

  const loadAnnouncements = useCallback(async () => {
    setBannersLoading(true);
    const { data: ann } = await supabase.from('announcements').select('*').order('sort_order').order('created_at', { ascending: false });
    setAnnouncements(ann ?? []);
    setBannersLoading(false);
  }, []);

  useLoadOnActive(active, loadAnnouncements);
  useImperativeHandle(ref, () => ({ reload: loadAnnouncements }), [loadAnnouncements]);

  const resetBannerForm = () => {
    setBannerTag('📢 Announcement'); setBannerTitle(''); setBannerSubtitle('');
    setBannerCtaLabel('Learn More'); setBannerCtaPage('dashboard');
    setBannerEmoji('📣'); setBannerGradient(GRADIENTS[0].value);
    setShowBannerForm(false);
  };

  const handleSaveBanner = async () => {
    if (!bannerTitle.trim()) { showToast('Title is required.'); return; }
    setSavingBanner(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { error } = await supabase.from('announcements').insert({
      tag: bannerTag.trim(), title: bannerTitle.trim(), subtitle: bannerSubtitle.trim(),
      cta_label: bannerCtaLabel.trim(), cta_page: bannerCtaPage,
      emoji: bannerEmoji.trim(), gradient: bannerGradient,
      is_active: true, created_by: authUser?.id,
    });
    setSavingBanner(false);
    if (error) showToast(error.message);
    else { showToast('Banner published!'); resetBannerForm(); loadAnnouncements(); }
  };

  const handleToggleBanner = async (a: Announcement) => {
    await supabase.from('announcements').update({ is_active: !a.is_active }).eq('id', a.id);
    loadAnnouncements();
  };

  const handleDeleteBanner = async (id: string) => {
    await supabase.from('announcements').delete().eq('id', id);
    showToast('Banner deleted.'); loadAnnouncements();
  };

  return (
    <div className="flex flex-col gap-4">

      {/* New Banner button */}
      {!showBannerForm && (
        <button
          onClick={() => setShowBannerForm(true)}
          className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white font-semibold text-xs py-3 rounded-2xl transition active:scale-95 shadow-md shadow-primary/20"
        >
          <Plus className="w-4 h-4" /> New Banner
        </button>
      )}

      {/* Banner form */}
      {showBannerForm && (
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Megaphone className="w-4 h-4 text-primary" /> New Announcement
          </h3>

          {/* Tag */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-normal text-slate-400">Tag (e.g. 🚗 Ride)</label>
            <input
              type="text"
              value={bannerTag}
              onChange={e => setBannerTag(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
            />
          </div>

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-normal text-slate-400">Title <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={bannerTitle}
              onChange={e => setBannerTitle(e.target.value)}
              placeholder="e.g. Gerak Car is Now Available"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
            />
          </div>

          {/* Subtitle */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-normal text-slate-400">Subtitle</label>
            <textarea
              value={bannerSubtitle}
              onChange={e => setBannerSubtitle(e.target.value)}
              rows={2}
              placeholder="Short description shown in the banner..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-primary transition resize-none"
            />
          </div>

          {/* CTA label + page row */}
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-xs font-normal text-slate-400">CTA Label</label>
              <input
                type="text"
                value={bannerCtaLabel}
                onChange={e => setBannerCtaLabel(e.target.value)}
                placeholder="Learn More"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
              />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-xs font-normal text-slate-400">CTA Page</label>
              <NativeSelect
                value={bannerCtaPage}
                onChange={setBannerCtaPage}
                options={CTA_PAGES}
                label="CTA Page"
              />
            </div>
          </div>

          {/* Emoji */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-normal text-slate-400">Decorative Emoji</label>
            <input
              type="text"
              value={bannerEmoji}
              onChange={e => setBannerEmoji(e.target.value)}
              maxLength={4}
              className="w-20 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:border-primary transition"
            />
          </div>

          {/* Gradient picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-normal text-slate-400">Banner Colour</label>
            <div className="flex flex-wrap gap-2">
              {GRADIENTS.map(g => (
                <button
                  key={g.value}
                  type="button"
                  onPointerDown={e => { e.preventDefault(); setBannerGradient(g.value); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r ${g.value} transition-transform active:scale-95 ${
                    bannerGradient === g.value ? 'ring-2 ring-offset-1 ring-slate-400' : ''
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          {bannerTitle && (
            <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${bannerGradient} p-4 text-white`} style={{ height: 100 }}>
              <div className="absolute -right-3 -top-3 text-6xl opacity-20 select-none pointer-events-none">{bannerEmoji}</div>
              <span className="self-start bg-white/20 border border-white/25 rounded-full px-2 py-0.5 text-xs font-semibold tracking-wider">{bannerTag}</span>
              <h4 className="text-sm font-black leading-tight mt-1 m-0">{bannerTitle}</h4>
              {bannerSubtitle && <p className="text-xs text-white/80 font-medium leading-snug mt-0.5 line-clamp-2">{bannerSubtitle}</p>}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={resetBannerForm}
              className="flex-1 bg-slate-100 text-slate-600 font-semibold text-xs py-2.5 rounded-xl transition active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveBanner}
              disabled={savingBanner || !bannerTitle.trim()}
              className="flex-1 bg-primary hover:bg-primary-hover text-white font-semibold text-xs py-2.5 rounded-xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {savingBanner
                ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : <><Megaphone className="w-3.5 h-3.5" /> Publish</>}
            </button>
          </div>
        </div>
      )}

      {/* Announcements list */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <Megaphone className="w-4 h-4" /> All Banners
        </h3>

        {bannersLoading ? (
          <div className="flex justify-center py-8">
            <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
          </div>
        ) : announcements.length === 0 ? (
          <p className="text-xs text-slate-400 font-semibold text-center py-6">No banners yet. Create one above.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {announcements.map(a => (
              <div key={a.id} className={`rounded-2xl border p-5 flex flex-col gap-2.5 ${a.is_active ? 'bg-white border-slate-100' : 'bg-slate-50 border-slate-200 opacity-60'}`}>

                {/* Preview strip */}
                <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${a.gradient} px-3 py-2 text-white flex items-center gap-2`}>
                  <span className="text-xl">{a.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold opacity-70 truncate">{a.tag}</p>
                    <p className="text-xs font-black truncate">{a.title}</p>
                  </div>
                </div>

                {/* Meta */}
                <p className="text-xs text-slate-400 font-semibold line-clamp-2">{a.subtitle}</p>
                <p className="text-xs text-slate-300 font-semibold">
                  CTA: {a.cta_label} → {a.cta_page} · {new Date(a.created_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onPointerDown={e => { e.preventDefault(); handleToggleBanner(a); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 font-semibold text-xs py-2 rounded-xl border transition-transform active:scale-95 ${
                      a.is_active
                        ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                        : 'bg-slate-100 border-slate-200 text-slate-500'
                    }`}
                  >
                    {a.is_active
                      ? <><ToggleRight className="w-3.5 h-3.5" /> Active</>
                      : <><ToggleLeft className="w-3.5 h-3.5" /> Inactive</>}
                  </button>
                  <button
                    onClick={() => showConfirmModal({
                      title: 'Delete Banner?',
                      message: `This removes the "${a.title}" announcement. This can't be undone.`,
                      confirmLabel: 'DELETE',
                      onConfirm: () => handleDeleteBanner(a.id),
                    })}
                    className="px-3 bg-red-50 border border-red-100 text-red-400 hover:text-red-600 font-semibold text-xs py-2 rounded-xl transition active:scale-95 flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
