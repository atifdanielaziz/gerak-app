import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { ChevronRight, Image as ImageIcon, Users, PackageSearch, GraduationCap, Clock, X } from 'lucide-react';
import { WaIcon } from '../lib/whatsapp';
import { RepresentativeSheet } from './RepresentativeSheet';
import { NativeSelect } from './NativeSelect';
import { getPendingJubahBooking, clearPendingJubahBooking, type PendingJubahBooking } from '../lib/pendingJubahBooking';
import { JUBAH_UNIVERSITIES, JUBAH_UNIVERSITY_MAP } from '../lib/jubahUniversities';

type RiderDir = { id: string; name: string; drop_point: string | null; method: string | null; ic_number: string | null; phone: string | null };

const IcMasked: React.FC<{ ic: string | null }> = ({ ic }) => {
  if (!ic) return <span className="font-semibold text-slate-700">—</span>;
  const digits = ic.replace(/\D/g, '');
  if (digits.length < 6) return <span className="font-semibold text-slate-700 font-mono">{ic}</span>;
  return (
    <span className="font-semibold font-mono">
      <span className="text-slate-700">{digits.slice(0, 6)}</span>
      <span className="text-slate-700">-</span>
      <span className="text-red-500">XX</span>
      <span className="text-slate-700">-</span>
      <span className="text-red-500">XXXX</span>
    </span>
  );
};

const BUCKET = 'jubah-banners';

interface Props {
  onProceed: (universityKey: string) => void;
}

export const JubahLanding: React.FC<Props> = ({ onProceed }) => {
  const { setSheetOpen, user, setCurrentPage } = useApp();
  const isAdmin = user.role === 'admin' || user.role === 'superadmin';

  const [selectedKey, setSelectedKey]   = useState('');
  const [bannerImages, setBannerImages] = useState<Record<string, { id: string; url: string }[]>>({});
  const [activeBannerIdx, setActiveBannerIdx] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX   = useRef(0);
  const [riderDir, setRiderDir]         = useState<RiderDir[]>([]);
  const [selectedRider, setSelectedRider] = useState<RiderDir | null>(null);
  const [pendingBooking, setPendingBooking] = useState<PendingJubahBooking | null>(null);

  // Booking that was saved but whose ToyyibPay checkout was never confirmed
  // in this browser (back button, closed tab) — a quiet nudge back to it,
  // not the full receipt, so an unpaid order never looks "confirmed" here.
  useEffect(() => {
    setPendingBooking(getPendingJubahBooking());
  }, []);

  const dismissPendingBooking = () => {
    clearPendingJubahBooking();
    setPendingBooking(null);
  };

  const openRider  = (r: RiderDir) => setSelectedRider(r);
  const closeRider = ()            => setSelectedRider(null);

  // Report to AppContext whenever the rider profile sheet is open, so
  // BottomNav hides itself — driven by state, not called inline at each
  // open/close site, so it stays paired 1:1 regardless of how it closes.
  useEffect(() => {
    if (!selectedRider) return;
    setSheetOpen(true);
    return () => setSheetOpen(false);
  }, [selectedRider, setSheetOpen]);

  // Fetch every university's banner images once on mount, grouped by
  // university_key — replaces the old single-fixed-path-per-university
  // scheme, so a university with zero uploaded images is now known for
  // certain (an empty array) rather than inferred from an <img> onError.
  useEffect(() => {
    supabase
      .from('jubah_banner_images')
      .select('id, university_key, storage_path')
      .order('position')
      .then(({ data }) => {
        const grouped: Record<string, { id: string; url: string }[]> = {};
        (data ?? []).forEach((row: { id: string; university_key: string; storage_path: string }) => {
          const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(row.storage_path);
          (grouped[row.university_key] ??= []).push({ id: row.id, url: pub.publicUrl });
        });
        queueMicrotask(() => setBannerImages(grouped));
      });
  }, []);

  const handleUniversityChange = (key: string) => {
    setSelectedKey(key);
    if (!key) { setRiderDir([]); return; }
    const campusList = JUBAH_UNIVERSITY_MAP[key]?.campuses ?? [key];

    // SECURITY DEFINER RPC — works for anon/guest (direct profiles query is blocked by RLS)
    supabase.rpc('get_jubah_riders_directory_v2', { p_campuses: campusList })
      .then(({ data }) => {
        setRiderDir((data ?? []).map((r: { id: string; name: string; drop_point: string | null; method: string | null; ic_number: string | null; phone: string | null }) => ({
          id: r.id, name: r.name, drop_point: r.drop_point, method: r.method, ic_number: r.ic_number, phone: r.phone,
        })));
      });
  };

  const hasOwnBanner   = !!selectedKey && (bannerImages[selectedKey]?.length ?? 0) > 0;
  const displayKey     = hasOwnBanner ? selectedKey : 'default';
  const displayImages  = bannerImages[displayKey] ?? [];
  const selectedLabel  = JUBAH_UNIVERSITIES.find(u => u.key === selectedKey)?.label ?? '';

  // Reset to the first slide whenever the displayed set changes (switching
  // university, or falling back to 'default') — an index left over from a
  // longer previous set could otherwise point past the end of a shorter one.
  useEffect(() => { queueMicrotask(() => setActiveBannerIdx(0)); }, [displayKey]);

  useEffect(() => {
    if (displayImages.length <= 1) return;
    const t = setInterval(() => setActiveBannerIdx(p => (p + 1) % displayImages.length), 4500);
    return () => clearInterval(t);
  }, [displayImages.length, displayKey]);

  const onBannerTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onBannerTouchEnd   = (e: React.TouchEvent) => {
    if (displayImages.length <= 1) return;
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 40) {
      setActiveBannerIdx(p => diff > 0
        ? (p + 1) % displayImages.length
        : (p - 1 + displayImages.length) % displayImages.length);
    }
  };

  return (
    <div className="flex-grow bg-white overflow-y-auto overflow-x-hidden no-scrollbar pb-4 px-4 animate-fade-in flex flex-col gap-4">

      {/* Header */}
      <div className="mt-4 px-1">
        <h2 className="text-xl font-semibold m-0 text-slate-800 flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-slate-400" /> Jubah Delivery
        </h2>
        <p className="text-xs text-slate-400 font-normal mt-0.5">
          Select your university to continue
        </p>
      </div>

      {/* Unfinished booking nudge — shown when a booking was saved but its
          ToyyibPay checkout was never confirmed complete in this browser */}
      {pendingBooking && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-amber-800 m-0">Unfinished booking</p>
            <p className="text-xs text-amber-600 font-semibold mt-0.5 truncate">
              {pendingBooking.reference} — check its payment status
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCurrentPage('track-jubah')}
            className="shrink-0 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-xl transition"
          >
            Check Status
          </button>
          <button
            type="button"
            onClick={dismissPendingBooking}
            aria-label="Dismiss"
            className="shrink-0 w-7 h-7 flex items-center justify-center text-amber-400 active:scale-90 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* University selector + banner */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">Select University</h3>
          <button
            type="button"
            onClick={() => { if (selectedKey) onProceed(selectedKey); }}
            disabled={!selectedKey}
            className={`flex items-center rounded-full py-1.5 transition-all duration-300 ease-out active:scale-90 ${
              selectedKey ? 'bg-primary text-white pl-3 pr-2' : 'bg-slate-100 text-slate-300 px-2'
            }`}
          >
            <span
              className="text-xs font-semibold whitespace-nowrap overflow-hidden"
              style={{
                maxWidth:   selectedKey ? '40px' : '0px',
                opacity:    selectedKey ? 1 : 0,
                marginRight: selectedKey ? '4px' : '0px',
                transition: 'max-width 0.35s ease, opacity 0.25s ease, margin-right 0.35s ease',
              }}
            >
              Next
            </span>
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        </div>

        <NativeSelect
          value={selectedKey}
          onChange={handleUniversityChange}
          options={JUBAH_UNIVERSITIES.map(u => ({ value: u.key, label: u.label }))}
          placeholder="Choose your university…"
          label="Select University"
        />

        {/* Banner area — swipeable carousel when a university has multiple
            images uploaded; a fixed aspect ratio is required here (unlike
            the old single dynamic-height <img>) since multiple slides are
            stacked via absolute positioning and need a shared frame. */}
        <div
          className="w-full rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 relative"
          style={{ aspectRatio: '16 / 9' }}
          onTouchStart={onBannerTouchStart}
          onTouchEnd={onBannerTouchEnd}
        >
          {displayImages.length > 0 ? (
            displayImages.map((img, idx) => (
              <img
                key={img.id}
                src={img.url}
                alt={`${selectedLabel || 'Gerak'} banner ${idx + 1}`}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
                  idx === activeBannerIdx ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              />
            ))
          ) : (
            <div className="min-h-[120px] flex flex-col items-center justify-center gap-2 text-slate-300 p-4 text-center">
              <ImageIcon className="w-10 h-10" />
              <span className="text-xs font-bold">No banner uploaded yet</span>
            </div>
          )}

          {/* Dot indicators — only meaningful with more than one slide */}
          {displayImages.length > 1 && (
            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-10">
              {displayImages.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onPointerDown={e => { e.preventDefault(); setActiveBannerIdx(idx); }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === activeBannerIdx ? 'w-5 bg-white' : 'w-1.5 bg-white/50'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Admin hint: shows when a university is selected but has no banner of its own → falling back to default */}
          {isAdmin && selectedKey && !hasOwnBanner && (
            <div className="absolute top-2 left-2 right-2 flex justify-center">
              <span className="bg-black/60 text-white text-[10px] font-bold px-2.5 py-1 rounded-full tracking-wide">
                Default banner · Upload {JUBAH_UNIVERSITY_MAP[selectedKey]?.shortLabel ?? selectedKey.toUpperCase()} banner via admin
              </span>
            </div>
          )}
        </div>

      </div>

      {/* Track existing order — Solo Card Standard tappable row */}
      <button
        type="button"
        onClick={() => setCurrentPage('track-jubah')}
        className="w-full bg-white border border-slate-100 rounded-2xl px-4 py-3 flex items-center gap-3 active:bg-slate-50 transition active:scale-[0.98]"
      >
        <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
          <PackageSearch className="w-4 h-4 text-slate-600" />
        </div>
        <span className="flex-1 text-sm font-semibold text-slate-700 text-left">Track My Jubah Order</span>
        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
      </button>

      {/* Rider Directory Table */}
      {riderDir.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
            <Users className="w-4 h-4" /> Representative Directory
          </h3>
          <div className="overflow-x-auto overflow-y-auto no-scrollbar max-h-[280px]">
            <table className="text-left border-collapse" style={{ minWidth: 480 }}>
              <thead className="sticky top-0 bg-white">
                <tr className="text-xs font-semibold text-slate-400 border-b border-slate-100">
                  <th className="py-2 pr-4 whitespace-nowrap">Method</th>
                  <th className="py-2 pr-4 whitespace-nowrap">Representative Name</th>
                  <th className="py-2 pr-4 whitespace-nowrap">I/C Number</th>
                  <th className="py-2 whitespace-nowrap">H/P</th>
                </tr>
              </thead>
              <tbody>
                {riderDir.map(r => (
                  <tr key={r.id} onClick={() => openRider(r)}
                    className="border-b border-slate-50 text-xs cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition">
                    <td className="py-2.5 pr-4 text-slate-600 font-semibold align-top whitespace-nowrap">
                      {r.method === 'pickup' ? 'Self Pickup' : r.method === 'postage' ? 'Pickup & Postage' : '—'}
                    </td>
                    <td className="py-2.5 pr-4 font-semibold text-slate-800 align-top">
                      {r.name}
                    </td>
                    <td className="py-2.5 pr-4 align-top whitespace-nowrap">
                      <IcMasked ic={r.ic_number} />
                    </td>
                    <td className="py-2.5 font-semibold text-slate-700 align-top whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{r.phone || '—'}</span>
                        {r.phone && <WaIcon className="w-3.5 h-3.5 text-[#25D366]" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 font-normal">
            I/C numbers are partially masked. Tap a row to contact the representative and confirm the full IC for physical registration.
          </p>
        </div>
      )}


      {/* Representative profile sheet */}
      {selectedRider && (
        <RepresentativeSheet
          name={selectedRider.name}
          dropPoint={selectedRider.drop_point || '—'}
          method={selectedRider.method === 'pickup' ? 'Self Pickup' : selectedRider.method === 'postage' ? 'Pickup & Postage' : '—'}
          icNumber={selectedRider.ic_number}
          phone={selectedRider.phone}
          waMessage={`Asslammualaikum Jubah rider, saya perlukan 6 digit IC ${selectedRider.ic_number ? selectedRider.ic_number.replace(/\D/g,'').slice(0,6) + '-XX-XXXX' : 'XXXXXX-XX-XXXX'} terakhir awak untuk pengisian representative jubah ${JUBAH_UNIVERSITY_MAP[selectedKey]?.shortLabel ?? selectedKey.toUpperCase()}`}
          onClose={closeRider}
        />
      )}

    </div>
  );
};
