import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import {
  BarChart3, Car, Users, Clock, CheckCircle2,
  AlertCircle, RefreshCw, Trash2, MapPin, Navigation,
  UserPlus, Mail, X, Send, ChevronDown, ChevronUp, ChevronRight, Megaphone, Plus, PlusCircle, MinusCircle, Minus, ToggleLeft, ToggleRight,
  FileImage, ShieldCheck, ShieldOff, ExternalLink, KeyRound,
  CalendarDays, Upload, Eye, Phone, ArrowLeftRight, Pencil, GraduationCap,
  ChevronLeft, Download, MoreVertical, Copy, Check, TrendingUp, Bike, Settings, Info, BadgeCheck,
} from 'lucide-react';
import { WaBtn, WaIcon, toWa } from '../lib/whatsapp';
import { MonthDrumPicker, EarningsCard, computeEarnings, type EarningsRow } from '../components/EarningsCard';
import { getJubahDocSignedUrl } from '../lib/jubahDocs';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface RideOrder {
  id: string;
  customer_name: string;
  campus: string;
  date: string;
  time: string;
  pickup: string;
  destination: string;
  passengers: number;
  contact: string;
  fare: string;
  night_charge: number;
  notes: string;
  status: string;
  driver_id: string | null;
  driver_name: string | null;
  driver_contact: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending:     'bg-amber-50 text-amber-700 border-amber-200',
  accepted:    'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  completed:   'bg-emerald-50 text-emerald-600 border-emerald-200',
  cancelled:   'bg-red-50 text-red-500 border-red-200',
};

type FilterStatus = 'all' | 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
type AdminTab = 'orders' | 'drivers' | 'users' | 'banners' | 'receipts' | 'calendar' | 'routes' | 'verify' | 'jubah' | 'earnings';

interface DriverEarningsRow {
  driver_id: string;
  name: string;
  gerak_id: string;
  campus: string;
  total_earnings: number;
  completed_count: number;
  cash_count: number;
  tbc_count: number;
}

type EarningsPeriod = 'day' | 'week' | 'month' | 'all';

const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return toISODate(d); };
const mondayOf = (iso: string) => { const d = new Date(iso + 'T00:00:00'); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return toISODate(d); };

function getLeaderboardRange(period: EarningsPeriod, day: string, weekStart: string, month: string): [string | null, string | null] {
  if (period === 'day') return [day, day];
  if (period === 'week') return [weekStart, addDays(weekStart, 6)];
  if (period === 'month') {
    const [y, m] = month.split('-').map(Number);
    return [`${month}-01`, `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`];
  }
  return [null, null];
}

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

interface ProfileUser {
  id: string;
  name: string;
  gerak_id: string;
  role: string;
  campus: string;
  email: string;
  status: string;
  phone: string;
  can_drive?: boolean;
  can_rent?: boolean;
  can_daily?: boolean;
  can_robe?: boolean;
  receipt_gate_exempt?: boolean;
  matric_no?: string;
  ic_number?: string;
  ic_url?: string;
  license_url?: string;
  vehicle?: string;
  plate_number?: string;
  docs_status?: string;
  fee_receipt_verified?: boolean;
}

interface DriverInvite {
  id: string;
  email: string;
  campus: string;
  role: string;
  can_drive: boolean;
  can_rent: boolean;
  used: boolean;
  used_at: string | null;
  created_at: string;
}

interface DriverReceipt {
  id: string;
  name: string;
  gerak_id: string;
  campus: string;
  email: string;
  phone: string;
  status: string;
  fee_receipt_url: string;
  fee_receipt_verified: boolean;
  fee_receipt_amount: string;
  fee_receipt_date: string;
  fee_receipt_expiry: string | null;
  fee_receipt_reject_reason: string;
}

interface Route {
  id: string;
  campus: string;
  point_a: string;
  point_b: string;
  price: number;
  is_active: boolean;
  created_at: string;
}

type PendingAction =
  | { type: 'toggle-status'; u: ProfileUser }
  | { type: 'terminate';     u: ProfileUser }
  | { type: 'toggle-cap';    u: ProfileUser; canDrive: boolean; canRent: boolean }
  | { type: 'toggle-rider-cap'; u: ProfileUser; canDaily: boolean; canRobe: boolean }
  | { type: 'campus';        u: ProfileUser; campus: 'Pekan' | 'Gambang' }
  | { type: 'toggle-role';   u: ProfileUser; newRole: 'driver' | 'admin' }
  | { type: 'toggle-gate-exempt'; u: ProfileUser };

// ── Profile detail sheet ─────────────────────────────────────────────────────
const ProfileSheet: React.FC<{ u: ProfileUser; onClose: () => void }> = ({ u, onClose }) => {
  const [extra, setExtra] = useState<Partial<ProfileUser>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('profiles')
      .select('matric_no, ic_number, ic_url, license_url, vehicle, plate_number, docs_status, fee_receipt_verified')
      .eq('id', u.id)
      .single()
      .then(({ data }) => { if (data) setExtra(data); setLoading(false); });
  }, [u.id]);

  const merged = { ...u, ...extra };
  const isDriverOrRider = u.role === 'driver' || u.role === 'rider';

  const avatarBg =
    u.role === 'superadmin' ? 'bg-violet-600 shadow-violet-200' :
    u.role === 'admin'      ? 'bg-blue-600 shadow-blue-200'     :
    u.role === 'rider'      ? 'bg-amber-500 shadow-amber-200'   :
                              'bg-emerald-600 shadow-emerald-200';
  const roleBadge =
    u.role === 'superadmin' ? 'bg-violet-50 border-violet-100 text-violet-600' :
    u.role === 'admin'      ? 'bg-blue-50 border-blue-100 text-blue-600'       :
    u.role === 'rider'      ? 'bg-amber-50 border-amber-100 text-amber-600'    :
                              'bg-emerald-50 border-emerald-100 text-emerald-600';

  const Row = ({ label, value, children }: { label: string; value?: string | null; children?: React.ReactNode }) => (
    <div className="flex items-start justify-between py-2.5 border-b border-slate-100 last:border-0 gap-2">
      <span className="text-xs font-normal text-slate-400 shrink-0 pt-0.5">{label}</span>
      <div className="text-right flex items-center gap-1.5 flex-wrap justify-end">
        {children ?? <span className={`text-xs font-semibold ${value ? 'text-slate-700' : 'text-slate-300'}`}>{value || '—'}</span>}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] max-h-[calc(100dvh-3rem)] bg-white rounded-t-3xl shadow-2xl animate-slide-up flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3 shrink-0">
          <p className="text-sm font-semibold text-slate-700">Staff Profile</p>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pb-4">

          {/* Avatar + name */}
          <div className="flex flex-col items-center pb-5 gap-2">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center ${avatarBg}`}>
              {u.role === 'driver' ? <Car className="w-9 h-9 text-white" /> :
               u.role === 'rider'  ? <Bike className="w-9 h-9 text-white" />  :
               <ShieldCheck className="w-9 h-9 text-white" />}
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-slate-800">{u.name}</p>
              <span className={`inline-flex items-center gap-1 mt-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${roleBadge}`}>
                <ShieldCheck className="w-3 h-3" /> {u.role}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
            </div>
          ) : (
            <>
              {/* Identity */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-1 mb-3">
                <Row label="Gerak ID"><span className="text-xs font-semibold text-primary">{u.gerak_id}</span></Row>
                <Row label="Campus" value={`UMPSA ${u.campus}`} />
                <Row label="Matric No." value={merged.matric_no} />
                <Row label="IC Number" value={merged.ic_number} />
                <Row label="Status">
                  <span className={`text-xs font-semibold ${u.status === 'active' ? 'text-emerald-600' : 'text-red-500'}`}>{u.status}</span>
                </Row>
              </div>

              {/* Contact */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-1 mb-3">
                <Row label="Email" value={u.email} />
                <Row label="Phone">
                  <span className="text-xs font-semibold text-slate-700">{u.phone || '—'}</span>
                  {u.phone && (
                    <a href={`https://wa.me/${toWa(u.phone)}`} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()} className="text-[#25D366] active:scale-90 transition">
                      <WaIcon className="w-3.5 h-3.5" />
                    </a>
                  )}
                </Row>
              </div>

              {/* Vehicle — drivers only */}
              {u.role === 'driver' && (
                <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-1 mb-3">
                  <Row label="Vehicle" value={merged.vehicle} />
                  <Row label="Plate" value={merged.plate_number} />
                  <Row label="Receipt">
                    <span className={`text-xs font-semibold ${merged.fee_receipt_verified ? 'text-emerald-600' : 'text-amber-500'}`}>
                      {merged.fee_receipt_verified ? 'Verified ✓' : 'Pending'}
                    </span>
                  </Row>
                </div>
              )}

              {/* Documents */}
              {isDriverOrRider && (
                <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-1 mb-3">
                  <Row label="Docs Status">
                    <span className={`text-xs font-semibold capitalize ${
                      merged.docs_status === 'verified' ? 'text-emerald-600' :
                      merged.docs_status === 'rejected' ? 'text-red-500' :
                      merged.docs_status === 'pending'  ? 'text-amber-500' : 'text-slate-400'
                    }`}>{merged.docs_status || 'none'}</span>
                  </Row>
                  <Row label="IC Photo">
                    {merged.ic_url
                      ? <a href={merged.ic_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg active:scale-95 transition flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> View
                        </a>
                      : <span className="text-xs font-semibold text-slate-300">Not uploaded</span>}
                  </Row>
                  <Row label="License">
                    {merged.license_url
                      ? <a href={merged.license_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg active:scale-95 transition flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> View
                        </a>
                      : <span className="text-xs font-semibold text-slate-300">Not uploaded</span>}
                  </Row>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer: Call + WhatsApp */}
        {u.phone && (
          <div className="px-4 pt-3 pb-6 flex gap-3 shrink-0 border-t border-slate-100">
            <a href={`tel:${u.phone}`}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-800 text-white font-semibold text-xs py-3.5 rounded-2xl active:scale-[0.98] transition">
              <Phone className="w-4 h-4" /> Call
            </a>
            <WaBtn phone={u.phone} />
          </div>
        )}
      </div>
    </div>
  );
};

// ── Jubah rider assignment sheet ─────────────────────────────────────────────
const JubahRiderSheet: React.FC<{
  rider: { name: string; gerak_id: string; campus: string; ic_number: string | null; phone: string | null };
  method: 'pickup' | 'postage' | '';
  dropPoint: string;
  saving: boolean;
  assignments: { id: string; method: string; drop_point: string | null }[];
  onMethodChange: (m: 'pickup' | 'postage') => void;
  onDropPointChange: (v: string) => void;
  onSave: () => void;
  onAddAssignment: (method: 'pickup' | 'postage', dropPoint: string) => Promise<void>;
  onDeleteAssignment: (id: string) => Promise<void>;
  onClose: () => void;
}> = ({ rider, method, dropPoint, saving, assignments, onMethodChange, onDropPointChange, onSave, onAddAssignment, onDeleteAssignment, onClose }) => {
  const [isEditingDropPoint, setIsEditingDropPoint] = useState(!dropPoint);
  const dropPointDisabled = method === 'postage' || !isEditingDropPoint;

  const [showAdd,    setShowAdd]    = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [addMethod,    setAddMethod]    = useState<'pickup' | 'postage'>('pickup');
  const [addDropPoint, setAddDropPoint] = useState('');
  const [addSaving,    setAddSaving]    = useState(false);

  const handleAdd = async () => {
    if (addMethod !== 'postage' && !addDropPoint.trim()) return;
    setAddSaving(true);
    await onAddAssignment(addMethod, addMethod === 'postage' ? '-' : addDropPoint.trim());
    setAddSaving(false);
    setShowAdd(false);
    setAddDropPoint('');
    setAddMethod('pickup');
  };

  // secondary = any assignments beyond the first (which was migrated from profiles)
  const secondary = assignments.slice(1);

  return (
  <div
    className="fixed inset-0 z-50 flex items-end justify-center"
    style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
    onClick={onClose}
  >
    <div
      className="w-full max-w-[480px] max-h-[calc(100dvh-3rem)] bg-white rounded-t-3xl shadow-2xl animate-slide-up flex flex-col"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex justify-center pt-3 pb-1 shrink-0">
        <div className="w-10 h-1 bg-slate-200 rounded-full" />
      </div>

      <div className="flex items-center justify-between px-5 pt-2 pb-4 shrink-0">
        <p className="text-sm font-semibold text-slate-700">Jubah Rider</p>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {/* Avatar + name */}
        <div className="flex flex-col items-center px-5 pb-4 gap-2">
          <div className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg bg-blue-600 shadow-blue-200">
            <GraduationCap className="w-9 h-9 text-white" />
          </div>
          <div className="text-center mt-1">
            <p className="text-xl font-black text-slate-800">{rider.name}</p>
            <span className="inline-flex items-center gap-1 mt-1 text-xs font-semibold px-2.5 py-1 rounded-full border bg-blue-50 border-blue-100 text-blue-600">
              <GraduationCap className="w-3 h-3" /> rider
            </span>
          </div>
        </div>

        {/* Info block */}
        <div className="mx-4 mb-4 bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-mono text-slate-700 space-y-1.5 leading-relaxed">
          <p><span className="text-slate-400">Gerak ID:</span> <span className="text-blue-600 font-semibold">{rider.gerak_id}</span></p>
          <p><span className="text-slate-400">Campus:</span> UMPSA {rider.campus}</p>
          <p><span className="text-slate-400">IC Number:</span> {rider.ic_number || '—'}</p>
          <div className="flex items-center gap-2">
            <span><span className="text-slate-400">H/P:</span> {rider.phone || '—'}</span>
            {rider.phone && (
              <a href={`https://wa.me/${toWa(rider.phone)}`} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-[#25D366] active:scale-90 transition shrink-0">
                <WaIcon className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>

        {/* Method + Drop point */}
        <div className="mx-4 mb-4 flex flex-col gap-5">

          {/* ── METHOD section ── */}
          <div className="flex flex-col gap-2">

            {/* METHOD 1 — primary (editable) */}
            <div className="flex flex-col gap-1">
              {/* Label row: dynamic "Method" vs "Method 1" + icon buttons */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-normal text-slate-400">
                  {(secondary.length > 0 || showAdd) ? 'Method 1' : 'Method'}
                </span>
                <div className="flex items-center gap-2">
                  {assignments.length > 1 && !showAdd && (
                    <button onClick={() => setDeleteMode(v => !v)} className="active:scale-90 transition">
                      <MinusCircle className={`w-5 h-5 ${deleteMode ? 'text-red-500' : 'text-slate-300'}`} />
                    </button>
                  )}
                  {assignments.length < 3 && !deleteMode && (
                    <button onClick={() => { setShowAdd(v => !v); setAddDropPoint(''); setAddMethod('pickup'); }} className="active:scale-90 transition">
                      <PlusCircle className={`w-5 h-5 ${showAdd ? 'text-indigo-500' : 'text-slate-300'}`} />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {deleteMode && <Minus className="w-4 h-4 text-slate-200 shrink-0" />}
                <div className="relative group flex-1">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 flex items-center justify-between pointer-events-none group-focus-within:border-primary transition">
                    <span style={{ fontSize: '12px' }} className={method ? 'font-semibold text-slate-700' : 'font-normal text-slate-300'}>
                      {method === 'pickup' ? 'Self Pickup' : method === 'postage' ? 'Pickup & Postage' : 'Select method...'}
                    </span>
                    <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                  </div>
                  <select
                    value={method}
                    onChange={e => onMethodChange(e.target.value as 'pickup' | 'postage')}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    style={{ fontSize: '16px' }}
                  >
                    <option value="" disabled>Select method...</option>
                    <option value="pickup">Self Pickup</option>
                    <option value="postage">Pickup &amp; Postage</option>
                  </select>
                </div>
              </div>
            </div>

            {/* METHOD 2+ — secondary (read-only) */}
            {secondary.map((a, i) => (
              <div key={a.id} className="flex flex-col gap-1">
                <span className="text-xs font-normal text-slate-400">Method {i + 2}</span>
                <div className="flex items-center gap-2">
                  {deleteMode && (
                    <button onClick={() => onDeleteAssignment(a.id)} className="text-red-500 active:scale-90 transition shrink-0">
                      <Minus className="w-4 h-4" />
                    </button>
                  )}
                  <div style={{ fontSize: '12px' }} className="flex-1 bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-3 font-semibold text-slate-600">
                    {a.method === 'pickup' ? 'Self Pickup' : 'Pickup & Postage'}
                  </div>
                </div>
              </div>
            ))}

            {/* New method input */}
            {showAdd && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-indigo-400">
                  Method {secondary.length + 2}
                </span>
                <div className="relative group">
                  <div className="bg-indigo-50/50 border border-indigo-200 rounded-xl py-2.5 px-3 flex items-center justify-between pointer-events-none transition">
                    <span style={{ fontSize: '12px' }} className="font-semibold text-slate-700">
                      {addMethod === 'pickup' ? 'Self Pickup' : 'Pickup & Postage'}
                    </span>
                    <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                  </div>
                  <select
                    value={addMethod}
                    onChange={e => setAddMethod(e.target.value as 'pickup' | 'postage')}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    style={{ fontSize: '16px' }}
                  >
                    <option value="pickup">Self Pickup</option>
                    <option value="postage">Pickup &amp; Postage</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* ── DROP POINT section ── */}
          <div className="flex flex-col gap-2">

            {/* DROP POINT 1 — primary (editable) */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-normal text-slate-400">
                {(secondary.length > 0 || showAdd) ? 'Drop Point 1' : 'Drop Point'}
              </span>
              <div className="flex items-start gap-2">
                {deleteMode && <div className="w-4 shrink-0" />}
                <div className="flex-1 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    {method !== 'postage' && (
                      <button
                        type="button"
                        onClick={() => setIsEditingDropPoint(v => !v)}
                        className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border transition active:scale-95 ${
                          isEditingDropPoint
                            ? 'bg-primary/10 border-primary/30 text-primary'
                            : 'bg-slate-100 border-slate-200 text-slate-500'
                        }`}
                      >
                        <Pencil className="w-2.5 h-2.5" /> {isEditingDropPoint ? 'Editing' : 'Edit'}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={dropPoint}
                    onChange={e => onDropPointChange(e.target.value)}
                    placeholder="e.g. UMP Gambang Counter"
                    disabled={dropPointDisabled}
                    style={{ fontSize: '12px' }}
                    className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 font-semibold text-slate-700 focus:outline-none focus:border-primary transition placeholder:font-normal disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {method === 'postage' && (
                    <p className="text-xs text-slate-400 font-semibold">Not applicable — robe is couriered, no physical drop point needed.</p>
                  )}
                </div>
              </div>
            </div>

            {/* DROP POINT 2+ — secondary (read-only) */}
            {secondary.map((a, i) => (
              <div key={a.id} className="flex flex-col gap-1">
                <span className="text-xs font-normal text-slate-400">Drop Point {i + 2}</span>
                <div className="flex items-center gap-2">
                  {deleteMode && <div className="w-4 shrink-0" />}
                  <div style={{ fontSize: '12px' }} className="flex-1 bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-3 font-semibold text-slate-600">
                    {a.drop_point && a.drop_point !== '-' ? a.drop_point : '— (Postage, no drop point)'}
                  </div>
                </div>
              </div>
            ))}

            {/* New drop point input */}
            {showAdd && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-indigo-400">
                  Drop Point {secondary.length + 2}
                </span>
                {addMethod !== 'postage' ? (
                  <input
                    type="text"
                    value={addDropPoint}
                    onChange={e => setAddDropPoint(e.target.value)}
                    placeholder="e.g. Kolej Kediaman 3, Lobby A"
                    style={{ fontSize: '12px' }}
                    className="bg-indigo-50/50 border border-indigo-200 rounded-xl py-2.5 px-3 font-semibold text-slate-700 focus:outline-none focus:border-indigo-400 transition placeholder:font-normal placeholder:text-slate-300"
                    autoFocus
                  />
                ) : (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-3 text-xs text-slate-400 font-semibold">
                    Not applicable — robe is couriered.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer — sticky, always reachable */}
      <div className="px-4 pt-3 flex flex-col gap-3 shrink-0 border-t border-slate-100" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        {showAdd ? (
          <div className="flex gap-2">
            <button
              onClick={() => { setShowAdd(false); setAddDropPoint(''); setAddMethod('pickup'); }}
              className="flex-1 bg-slate-100 text-slate-600 font-semibold text-xs py-3.5 rounded-2xl active:scale-95 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={addSaving || (addMethod !== 'postage' && !addDropPoint.trim())}
              className="flex-1 bg-indigo-600 text-white font-semibold text-xs py-3.5 rounded-2xl active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {addSaving
                ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : 'Add Assignment'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => { onSave(); setIsEditingDropPoint(false); }}
            disabled={saving || !method}
            className="w-full bg-primary text-white font-semibold text-xs py-3.5 rounded-2xl active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving
              ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              : 'Save Assignment'}
          </button>
        )}
      </div>
    </div>
  </div>
  );
};

// ── Shared user card ────────────────────────────────────────────────────────
const UserCard: React.FC<{
  u: ProfileUser;
  canManage: boolean;
  togglingStatus: string | null;
  terminating: string | null;
  togglingCap?: string | null;
  togglingCampus?: string | null;
  onToggle: (u: ProfileUser) => void;
  onTerminate: (u: ProfileUser) => void;
  onCapToggle?: (u: ProfileUser, canDrive: boolean, canRent: boolean) => void;
  onRiderCapToggle?: (u: ProfileUser, canDaily: boolean, canRobe: boolean) => void;
  onCampusChange?: (u: ProfileUser, campus: 'Pekan' | 'Gambang') => void;
  onGateToggle?: (u: ProfileUser) => void;
  onRoleToggle?: (u: ProfileUser, newRole: 'driver' | 'admin') => void;
  onViewProfile?: (u: ProfileUser) => void;
}> = ({ u, canManage, togglingStatus, terminating, togglingCap, togglingCampus, onToggle, onTerminate, onCapToggle, onRiderCapToggle, onCampusChange, onGateToggle, onRoleToggle, onViewProfile }) => {
  const [showMenu, setShowMenu] = useState(false);
  const isDriverOrRider = u.role === 'driver' || u.role === 'rider';

  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-2.5 ${
      u.status === 'inactive' ? 'bg-red-50/50 border-red-100' : 'bg-white border-slate-100'
    }`}>

      {/* Header row: info + ⋮ menu */}
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onViewProfile?.(u)}
          className="flex-1 min-w-0 text-left active:opacity-70 transition"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-black text-slate-800 truncate">{u.name}</p>
            <span className={`text-xs font-semibold uppercase shrink-0 ${
              u.role === 'driver'   ? 'text-emerald-600' :
              u.role === 'rider'   ? 'text-amber-600' :
              u.role === 'admin' || u.role === 'superadmin' ? 'text-blue-600' :
              'text-slate-400'
            }`}>{u.role}</span>
            {u.status === 'inactive' && (
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 uppercase shrink-0">
                Suspended
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">{u.gerak_id} · UMPSA {u.campus}</p>
          <p className="text-xs text-slate-400 truncate">{u.email}</p>
        </button>

        {/* ⋮ vertical dots */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowMenu(p => !p)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 active:scale-90 transition"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden min-w-[170px]">

                {/* Driver capabilities */}
                {u.role === 'driver' && onCapToggle && (
                  <>
                    <button onClick={() => { onCapToggle(u, !u.can_drive, u.can_rent ?? false); setShowMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition active:scale-95 ${u.can_drive ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>
                      <Car className="w-4 h-4 shrink-0" />
                      {u.can_drive ? 'Car ✓' : 'Car ✗'}
                      {togglingCap === u.id && <span className="ml-auto w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />}
                    </button>
                    <button onClick={() => { onCapToggle(u, u.can_drive ?? false, !u.can_rent); setShowMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition active:scale-95 ${u.can_rent ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>
                      <KeyRound className="w-4 h-4 shrink-0" />
                      {u.can_rent ? 'Rental ✓' : 'Rental ✗'}
                    </button>
                  </>
                )}

                {/* Rider capabilities */}
                {u.role === 'rider' && onRiderCapToggle && (
                  <>
                    <button onClick={() => { onRiderCapToggle(u, !u.can_daily, u.can_robe ?? false); setShowMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition active:scale-95 ${u.can_daily ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>
                      <Bike className="w-4 h-4" />
                      {u.can_daily ? 'Daily ✓' : 'Daily ✗'}
                      {togglingCap === u.id && <span className="ml-auto w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />}
                    </button>
                    <button onClick={() => { onRiderCapToggle(u, u.can_daily ?? false, !u.can_robe); setShowMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition active:scale-95 ${u.can_robe ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>
                      <GraduationCap className="w-4 h-4" />
                      {u.can_robe ? 'Robe ✓' : 'Robe ✗'}
                    </button>
                  </>
                )}

                {/* Campus toggle */}
                {isDriverOrRider && onCampusChange && (
                  (['Gambang', 'Pekan'] as const).map(c => (
                    <button key={c}
                      onClick={() => { if (u.campus !== c) onCampusChange(u, c); setShowMenu(false); }}
                      disabled={togglingCampus === u.id}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition active:scale-95 disabled:opacity-40 ${u.campus === c ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>
                      <MapPin className="w-4 h-4 shrink-0" />
                      {c}
                      {u.campus === c && <span className="ml-auto text-[8px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">Active</span>}
                      {togglingCampus === u.id && u.campus !== c && <span className="ml-auto w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />}
                    </button>
                  ))
                )}

                {/* Gate toggle */}
                {isDriverOrRider && onGateToggle && canManage && (
                  <button onClick={() => { onGateToggle(u); setShowMenu(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition active:scale-95 ${u.receipt_gate_exempt ? 'bg-violet-50 text-violet-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    {u.receipt_gate_exempt ? 'Gate ✓' : 'Gate ✗'}
                    {togglingCap === u.id && <span className="ml-auto w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />}
                  </button>
                )}

                {/* Role toggle — superadmin only */}
                {onRoleToggle && isDriverOrRider && (
                  <button onClick={() => { onRoleToggle(u, 'admin'); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition active:scale-95">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    Make Admin
                  </button>
                )}
                {onRoleToggle && u.role === 'admin' && (
                  <button onClick={() => { onRoleToggle(u, 'driver'); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold text-red-500 hover:bg-red-50 transition active:scale-95">
                    <ShieldOff className="w-4 h-4 shrink-0" />
                    Remove Admin
                  </button>
                )}

                <div className="border-t border-slate-100" />

                {/* WhatsApp smart message */}
                {u.phone && (
                  <a
                    href={(() => {
                      const missing: string[] = [];
                      if (!u.ic_number)   missing.push('nombor IC');
                      if (!u.ic_url)      missing.push('gambar IC');
                      if ((u.role === 'driver' || u.role === 'rider') && !u.license_url) missing.push('gambar lesen memandu');
                      if (!u.matric_no)   missing.push('nombor matrik');
                      if (u.role === 'driver' && !u.vehicle) missing.push('maklumat kenderaan');
                      if (u.status === 'inactive') missing.push('status akaun (hubungi admin)');
                      const body = missing.length > 0
                        ? `Assalamualaikum ${u.name} 👋, admin Gerak di sini.\n\nSila kemaskini maklumat berikut dalam akaun anda:\n${missing.map(m => `• ${m}`).join('\n')}\n\nTerima kasih 🙏`
                        : `Assalamualaikum ${u.name} 👋, admin Gerak di sini. Ada sesuatu yang ingin kami maklumkan. Terima kasih 🙏`;
                      return `https://wa.me/${toWa(u.phone)}?text=${encodeURIComponent(body)}`;
                    })()}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowMenu(false)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold text-[#25D366] hover:bg-green-50 transition active:scale-95"
                  >
                    <WaIcon className="w-4 h-4 shrink-0" />
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stop + Terminate */}
      {canManage && (
        <div className="flex gap-1.5">
          <button
            onClick={() => onToggle(u)}
            disabled={togglingStatus === u.id}
            className={`flex-1 min-w-0 font-semibold text-xs py-1.5 px-1 rounded-xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center ${
              u.status === 'active'
                ? 'bg-amber-50 border border-amber-200 text-amber-700'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            }`}
          >
            {togglingStatus === u.id
              ? <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
              : u.status === 'active' ? 'Stop' : 'Reactivate'}
          </button>
          <button
            onClick={() => onTerminate(u)}
            disabled={terminating === u.id}
            className="flex-1 min-w-0 bg-red-50 border border-red-200 text-red-600 font-semibold text-xs py-1.5 px-1 rounded-xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-0.5"
          >
            {terminating === u.id
              ? <span className="w-3 h-3 rounded-full border border-red-400 border-t-transparent animate-spin" />
              : <><Trash2 className="w-3 h-3 shrink-0" /> Terminate</>}
          </button>
        </div>
      )}
    </div>
  );
};

export const AdminHome: React.FC = () => {
  const { user, setCurrentPage, setSheetOpen } = useApp();

  const isSuperAdmin = user.role === 'superadmin';
  const adminCampus = (
    user.campus.charAt(0).toUpperCase() + user.campus.slice(1).toLowerCase()
  ) as 'Pekan' | 'Gambang';

  const [activeTab, setActiveTab] = useState<AdminTab>('orders');
  const [campusView, setCampusView] = useState<'Pekan' | 'Gambang'>(
    isSuperAdmin ? 'Gambang' : adminCampus
  );
  const [orders, setOrders] = useState<RideOrder[]>([]);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  // Driver invites state
  const [invites, setInvites]               = useState<DriverInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteSearch, setInviteSearch]     = useState('');
  const [inviteEmail, setInviteEmail]       = useState('');
  const [inviteCampus, setInviteCampus]     = useState<'Pekan' | 'Gambang'>(
    isSuperAdmin ? 'Gambang' : adminCampus
  );
  const [inviteRole, setInviteRole]         = useState<'driver' | 'rider' | 'admin'>('driver');
  const [inviteCanDrive, setInviteCanDrive] = useState(true);
  const [inviteCanRent,  setInviteCanRent]  = useState(false);
  const [inviteCanDaily, setInviteCanDaily] = useState(false);
  const [inviteCanRobe,  setInviteCanRobe]  = useState(false);
  const [inviteSending, setInviteSending]   = useState(false);
  const [togglingCap, setTogglingCap]         = useState<string | null>(null);
  const [togglingCampus, setTogglingCampus]   = useState<string | null>(null);
  const [showInviteConfirm, setShowInviteConfirm] = useState(false);

  // Users management state
  const [profileUsers, setProfileUsers]     = useState<ProfileUser[]>([]);
  const [usersLoading, setUsersLoading]     = useState(false);
  const [terminating, setTerminating]       = useState<string | null>(null);
  const [togglingStatus, setTogglingStatus] = useState<string | null>(null);
  const [staffSearch, setStaffSearch]       = useState('');
  const [pendingAction, setPendingAction]   = useState<PendingAction | null>(null);
  const [staffFilter, setStaffFilter]       = useState<'all' | 'drivers' | 'riders' | 'admins'>('all');
  const [sheetUser, setSheetUser]           = useState<ProfileUser | null>(null);

  // Banners state
  const [announcements, setAnnouncements]       = useState<Announcement[]>([]);
  const [bannersLoading, setBannersLoading]     = useState(false);
  const [jubahActive, setJubahActive]           = useState(false);
  const [togglingJubah, setTogglingJubah]       = useState(false);
  const [showBannerForm, setShowBannerForm]     = useState(false);
  const [savingBanner, setSavingBanner]         = useState(false);
  const [bannerTag, setBannerTag]               = useState('📢 Announcement');
  const [bannerTitle, setBannerTitle]           = useState('');
  const [bannerSubtitle, setBannerSubtitle]     = useState('');
  const [bannerCtaLabel, setBannerCtaLabel]     = useState('Learn More');
  const [bannerCtaPage, setBannerCtaPage]       = useState('dashboard');
  const [bannerEmoji, setBannerEmoji]           = useState('📣');
  const [bannerGradient, setBannerGradient]     = useState(GRADIENTS[0].value);

  // Receipts state
  const [driverReceipts, setDriverReceipts]       = useState<DriverReceipt[]>([]);
  const [receiptsLoading, setReceiptsLoading]     = useState(false);
  const [receiptFilter, setReceiptFilter]         = useState<'all' | 'verified' | 'pending' | 'rejected' | 'expired'>('all');
  const [receiptSearch, setReceiptSearch]         = useState('');
  const [receiptRoleFilter, setReceiptRoleFilter] = useState<'driver' | 'rider'>('driver');
  const [receiptGateOn, setReceiptGateOn]         = useState(true);
  const [togglingReceiptGate, setTogglingReceiptGate] = useState(false);
  const [showGateMasterConfirm, setShowGateMasterConfirm] = useState(false);
  const [approvingReceipt, setApprovingReceipt]   = useState<string | null>(null);

  // Driver earnings state
  const [earningsLeaderboard, setEarningsLeaderboard] = useState<DriverEarningsRow[]>([]);
  const [earningsLoading, setEarningsLoading]         = useState(false);
  const [earningsDriverId, setEarningsDriverId]       = useState<string | null>(null);
  const [earningsHistory, setEarningsHistory]         = useState<EarningsRow[]>([]);
  const [earningsPeriod, setEarningsPeriod]           = useState<EarningsPeriod>('all');
  const [earningsDay, setEarningsDay]                 = useState(() => toISODate(new Date()));
  const [earningsWeekStart, setEarningsWeekStart]     = useState(() => mondayOf(toISODate(new Date())));
  const [leaderboardMonth, setLeaderboardMonth]       = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [detailMonth, setDetailMonth]                 = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rejectingReceipt, setRejectingReceipt]   = useState<string | null>(null);

  // Routes state
  const [routes, setRoutes]               = useState<Route[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);

  // ── Verify tab state ──────────────────────────────────────────────────────
  type VerifyDoc = { id: string; name: string; gerak_id: string; campus: string; role: string; ic_number: string | null; ic_url: string | null; license_url: string | null; docs_status: string; docs_reject_reason: string | null };
  const [verifyDocs,      setVerifyDocs]      = useState<VerifyDoc[]>([]);
  const [verifyLoading,   setVerifyLoading]   = useState(false);
  const [verifyFilter,    setVerifyFilter]    = useState<'driver' | 'rider'>('driver');
  const [verifySearch,    setVerifySearch]    = useState('');
  const [rejectingDoc,    setRejectingDoc]    = useState<string | null>(null);
  const [rejectReason,    setRejectReason]    = useState('');

  // ── Jubah tab state ────────────────────────────────────────────────────────
  type JubahRider   = { id: string; name: string; gerak_id: string; campus: string; status: string; can_robe: boolean; ic_number: string | null; phone: string | null; jubah_method: string | null; jubah_drop_point: string | null };
  type JubahAssignment = { id: string; rider_id: string; name: string; drop_point: string | null; method: string; campus: string; ic_number: string | null; phone: string | null };
  type JubahBookingRow = {
    id: string; reference: string; full_name: string; ic_number: string; hp_number: string;
    matric_id: string; university: string; campus: string; faculty: string; remark: string;
    rider_name: string | null; rider_phone: string | null; status: string; payment_mode: string; cost: number;
    balance_due: number; balance_paid: boolean; balance_proof_url: string | null;
    delivery_address: string | null;
    docs_path: string | null; payment_path: string | null; oscar_path: string | null;
    skpg_path: string | null; konvo_path: string | null; ic_path: string | null;
    created_at: string;
  };
  const [jubahRiders,        setJubahRiders]        = useState<JubahRider[]>([]);
  const [jubahRidersLoading, setJubahRidersLoading] = useState(false);
  const [jubahAssignments,   setJubahAssignments]   = useState<JubahAssignment[]>([]);
  const [dirSheet,           setDirSheet]           = useState<JubahAssignment | null>(null);
  const [jubahBookings,      setJubahBookings]      = useState<JubahBookingRow[]>([]);
  const [jubahBookingsLoading, setJubahBookingsLoading] = useState(false);
  const [deletingBooking,    setDeletingBooking]    = useState<string | null>(null);
  const [confirmingBooking,  setConfirmingBooking]  = useState(false);
  const [jubahSearch,          setJubahSearch]          = useState('');
  const [jubahPayFilter,       setJubahPayFilter]       = useState<'all' | 'booked' | 'paid'>('all');
  const [jubahAdminView,     setJubahAdminView]     = useState<'list' | 'card' | 'details'>('list');
  const [jubahAdminSelected, setJubahAdminSelected] = useState<JubahBookingRow | null>(null);
  const [jubahAdminUpdating, setJubahAdminUpdating] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [jubahSubTab,        setJubahSubTab]        = useState<'customer' | 'rider' | 'price' | 'banner'>('rider');

  const BANNER_BUCKET = 'jubah-banners';
  const BANNER_ITEMS = [
    { key: 'default', label: 'Default Banner (RUNNER GERAK)' },
    { key: 'umpsa',   label: 'Universiti Malaysia Pahang Al-Sultan Abdullah (UMPSA)' },
    { key: 'uitm',    label: 'Universiti Teknologi MARA (UiTM)' },
    { key: 'umk',     label: 'Universiti Malaysia Kelantan (UMK)' },
    { key: 'ukm',     label: 'Universiti Kebangsaan Malaysia (UKM)' },
    { key: 'uiam',    label: 'Universiti Islam Antarabangsa Malaysia (UIA)' },
  ];
  type DocField = { id: string; label: string; hint: string | null; position: number };
  const [bannerUrls,        setBannerUrls]        = useState<Record<string, string>>({});
  const [bannerImgError,    setBannerImgError]    = useState<Record<string, boolean>>({});
  const [bannerRefreshKey,  setBannerRefreshKey]  = useState<Record<string, number>>({});
  const [bannerUploading,   setBannerUploading]   = useState<string | null>(null);
  const [bannerUploadKey,   setBannerUploadKey]   = useState<string | null>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);
  const [sampleDocsPage,   setSampleDocsPage]   = useState<{ key: string; label: string } | null>(null);
  const [docFields,        setDocFields]        = useState<DocField[]>([]);
  const [sampleUrls,       setSampleUrls]       = useState<Record<string, string>>({});
  const [sampleLoaded,     setSampleLoaded]     = useState<Record<string, boolean>>({});
  const [sampleUploading,  setSampleUploading]  = useState<string | null>(null);
  const [currentSampleDoc, setCurrentSampleDoc] = useState<string | null>(null);
  const sampleFileRef   = useRef<HTMLInputElement>(null);
  const mainScrollRef   = useRef<HTMLDivElement>(null);
  const [cropSrc,        setCropSrc]        = useState<string>('');
  const [cropObj,        setCropObj]        = useState<Crop | undefined>(undefined);
  const [completedCrop,  setCompletedCrop]  = useState<PixelCrop | undefined>(undefined);
  const cropImgRef = useRef<HTMLImageElement>(null);
  type JubahPrice = { remark: string; payment_mode: string; price: number };
  const [savingPrice,        setSavingPrice]        = useState<string | null>(null);
  const [priceDrafts,        setPriceDrafts]        = useState<Record<string, string>>({});
  const [jubahSheetRider,    setJubahSheetRider]    = useState<JubahRider | null>(null);
  const [jubahMethodDraft,   setJubahMethodDraft]   = useState<'pickup' | 'postage' | ''>('');
  const [jubahDropPointDraft, setJubahDropPointDraft] = useState('');
  const [savingJubahAssignment, setSavingJubahAssignment] = useState(false);

  // Report to AppContext whenever any bottom sheet/modal here is open,
  // so BottomNav can hide itself and never overlap sheet content.
  useEffect(() => {
    const anyOpen = !!sheetUser || !!jubahSheetRider || !!pendingAction || showGateMasterConfirm || showInviteConfirm;
    setSheetOpen(anyOpen);
    return () => setSheetOpen(false);
  }, [sheetUser, jubahSheetRider, pendingAction, showGateMasterConfirm, showInviteConfirm, setSheetOpen]);

  const handleSavePrice = async (remark: string, paymentMode: string) => {
    const key = `${remark}_${paymentMode}`;
    const price = parseFloat(priceDrafts[key] ?? '0');
    if (isNaN(price) || price < 0) { showToast('Invalid price.'); return; }
    setSavingPrice(key);
    const { error } = await supabase.rpc('set_jubah_price', {
      p_remark: remark, p_payment_mode: paymentMode, p_price: price,
    });
    setSavingPrice(null);
    if (error) showToast('Failed to save price.');
    else {
      showToast(`${remark} ${paymentMode === 'pickup' ? 'Pickup' : 'Postage'} price updated.`);
      loadJubahData();
    }
  };

  const handleSaveJubahAssignment = async () => {
    if (!jubahSheetRider) return;
    setSavingJubahAssignment(true);
    const { error } = await supabase.rpc('set_rider_jubah_assignment', {
      p_user_id:    jubahSheetRider.id,
      p_method:     jubahMethodDraft || null,
      p_drop_point: jubahDropPointDraft.trim() || null,
    });
    setSavingJubahAssignment(false);
    if (error) { showToast('Failed to update assignment.'); return; }
    showToast(`${jubahSheetRider.name}'s assignment updated.`);
    setJubahSheetRider(null);
    loadJubahData();
  };

  const handleDeleteJubahBooking = async (b: JubahBookingRow) => {
    if (!window.confirm(`Delete booking ${b.reference} for ${b.full_name}? This cannot be undone.`)) return;
    setDeletingBooking(b.id);
    const { error } = await supabase.from('jubah_bookings').delete().eq('id', b.id);
    setDeletingBooking(null);
    if (error) showToast('Delete failed: ' + error.message);
    else { showToast(`${b.reference} deleted.`); setJubahBookings(prev => prev.filter(r => r.id !== b.id)); }
  };

  const loadJubahData = useCallback(async () => {
    setJubahRidersLoading(true);
    setJubahBookingsLoading(true);

    const { data: setting } = await supabase.from('app_settings').select('value').eq('key', 'jubah_active').single();
    if (setting) setJubahActive(setting.value === 'true');

    let ridersQ = supabase.from('profiles')
      .select('id, name, gerak_id, campus, status, can_robe, ic_number, phone, jubah_method, jubah_drop_point')
      .eq('role', 'rider')
      .eq('can_robe', true)
      .order('name');
    if (!isSuperAdmin) ridersQ = ridersQ.eq('campus', adminCampus);
    const { data: ridersData } = await ridersQ;
    setJubahRiders((ridersData as JubahRider[]) ?? []);
    setJubahRidersLoading(false);

    // Load assignments for Representative Directory
    const riderIds = (ridersData ?? []).map((r: JubahRider) => r.id);
    if (riderIds.length > 0) {
      const { data: assignData } = await supabase
        .from('jubah_rider_assignments')
        .select('id, rider_id, drop_point, method, campus')
        .in('rider_id', riderIds)
        .eq('is_active', true)
        .order('created_at');
      const profileMap = Object.fromEntries((ridersData ?? []).map((r: JubahRider) => [r.id, r]));
      setJubahAssignments(
        (assignData ?? []).map((a: { id: string; rider_id: string; drop_point: string | null; method: string; campus: string }) => {
          const p = profileMap[a.rider_id] as JubahRider | undefined;
          return { ...a, name: p?.name ?? '—', ic_number: p?.ic_number ?? null, phone: p?.phone ?? null };
        })
      );
    } else {
      setJubahAssignments([]);
    }

    let bookingsQ = supabase.from('jubah_bookings')
      .select('id, reference, full_name, ic_number, hp_number, matric_id, university, campus, faculty, remark, rider_name, rider_phone, status, payment_mode, cost, balance_due, balance_paid, balance_proof_url, delivery_address, docs_path, payment_path, oscar_path, skpg_path, konvo_path, ic_path, created_at')
      .order('created_at', { ascending: false });
    if (!isSuperAdmin) bookingsQ = bookingsQ.eq('campus', adminCampus);
    const { data: bookingsData, error: bookingsError } = await bookingsQ;
    if (bookingsError) {
      console.error('[GERAK] jubah_bookings load error:', bookingsError.message, bookingsError.details);
      // Fallback: fetch without new columns in case migration not yet applied
      let fallbackQ = supabase.from('jubah_bookings')
        .select('id, reference, full_name, hp_number, matric_id, campus, faculty, remark, rider_name, status, payment_mode, created_at')
        .order('created_at', { ascending: false });
      if (!isSuperAdmin) fallbackQ = fallbackQ.eq('campus', adminCampus);
      const { data: fallbackData, error: fallbackError } = await fallbackQ;
      if (fallbackError) console.error('[GERAK] jubah_bookings fallback error:', fallbackError.message);
      setJubahBookings(((fallbackData ?? []) as JubahBookingRow[]).map(r => ({
        ...r,
        ic_number: '', university: '', cost: 0, balance_due: 0, balance_paid: false, balance_proof_url: null,
        delivery_address: null, docs_path: null, payment_path: null, oscar_path: null,
        skpg_path: null, konvo_path: null, ic_path: null,
      })));
    } else {
      setJubahBookings((bookingsData as JubahBookingRow[]) ?? []);
    }
    setJubahBookingsLoading(false);

    const { data: pricesData } = await supabase.rpc('get_jubah_pricing');
    if (pricesData) {
      const drafts: Record<string, string> = {};
      (pricesData as JubahPrice[]).forEach(p => {
        drafts[`${p.remark}_${p.payment_mode}`] = String(p.price);
      });
      setPriceDrafts(drafts);
    }
  }, [isSuperAdmin, adminCampus]);

  useEffect(() => { if (activeTab === 'jubah') loadJubahData(); }, [activeTab, loadJubahData]);

  // ── Admin Jubah 3-page back navigation ───────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'jubah' || jubahSubTab !== 'customer') return;
    const handlePop = () => {
      setJubahAdminView(prev => {
        if (prev === 'details') return 'card';
        if (prev === 'card')   { setJubahAdminSelected(null); return 'list'; }
        return prev;
      });
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [activeTab, jubahSubTab]);

  const goToAdminCard = (b: JubahBookingRow) => {
    setJubahAdminSelected(b);
    setJubahAdminView('card');
    window.history.pushState({ jubahAdmin: 'card' }, '');
  };
  const goToAdminDetails = () => {
    setJubahAdminView('details');
    window.history.pushState({ jubahAdmin: 'details' }, '');
  };
  const goAdminBack = () => window.history.back();

  const JUBAH_STATUS_LABEL: Record<string, string> = {
    ordered:    'Pending',
    paid:       'Paid',
    booked:     'New', processing: 'Processing', collected: 'Collected',
    at_hub:     'At Hub', delivered: 'Delivered', cancelled: 'Cancelled',
  };
  const JUBAH_STATUS_STYLE: Record<string, string> = {
    ordered:    'bg-slate-50 border-slate-200 text-slate-500',
    paid:       'bg-emerald-50 border-emerald-100 text-emerald-700',
    booked:     'bg-blue-50 border-blue-100 text-blue-700',
    processing: 'bg-violet-50 border-violet-100 text-violet-700',
    collected:  'bg-amber-50 border-amber-100 text-amber-700',
    at_hub:     'bg-emerald-50 border-emerald-100 text-emerald-700',
    delivered:  'bg-emerald-50 border-emerald-100 text-emerald-700',
    cancelled:  'bg-red-50 border-red-100 text-red-600',
  };
  const JUBAH_NEXT_LABEL: Record<string, string> = {
    paid:       'Start Booking',
    processing: 'Start Processing',
    collected:  'Mark Collected',
    at_hub:     'Mark Delivered to Hub',
    delivered:  'Mark Delivered',
  };
  const jubahGetSteps = (mode: string) =>
    mode === 'deposit'
      ? ['booked', 'processing', 'collected', 'delivered']
      : mode === 'postage'
      ? ['paid', 'booked', 'processing', 'collected', 'at_hub']
      : ['paid', 'booked', 'processing', 'collected', 'delivered'];

  const handleConfirmJubahBooking = async () => {
    if (!jubahAdminSelected) return;
    const b = jubahAdminSelected;
    setConfirmingBooking(true);

    if (b.payment_mode === 'deposit' && b.balance_proof_url && !b.balance_paid) {
      // State 2: confirm balance payment for deposit
      const { data } = await supabase.rpc('mark_jubah_balance_paid', { p_booking_id: b.id });
      if (data?.success) {
        const updated = { ...b, balance_paid: true };
        setJubahAdminSelected(updated);
        setJubahBookings(prev => prev.map(r => r.id === b.id ? updated : r));
        showToast('Balance confirmed ✓');
      } else {
        showToast('Failed to confirm balance.');
      }
    } else if (b.status === 'ordered' && b.payment_path) {
      // State 1: confirm initial payment — deposit→booked, others→paid
      const newStatus = b.payment_mode === 'deposit' ? 'booked' : 'paid';
      const { data, error } = await supabase.rpc('update_jubah_booking_status', {
        p_booking_id: b.id,
        p_status:     newStatus,
      });
      if (error || !data?.success) {
        showToast('Failed to confirm payment.');
      } else {
        const updated = { ...b, status: newStatus };
        setJubahAdminSelected(updated);
        setJubahBookings(prev => prev.map(r => r.id === b.id ? updated : r));
        showToast(b.payment_mode === 'deposit' ? 'Deposit confirmed → Booked ✓' : 'Payment confirmed → Paid ✓');
      }
    }
    setConfirmingBooking(false);
  };

  const handleAdminAdvanceStatus = async () => {
    if (!jubahAdminSelected) return;
    const steps = jubahGetSteps(jubahAdminSelected.payment_mode);
    const idx   = steps.indexOf(jubahAdminSelected.status);
    const next  = idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : null;
    if (!next) return;
    setJubahAdminUpdating(true);
    const { data, error } = await supabase.rpc('update_jubah_booking_status', {
      p_booking_id: jubahAdminSelected.id,
      p_status:     next,
    });
    if (error || !data?.success) {
      showToast('Update failed. Please try again.');
    } else {
      const updated = { ...jubahAdminSelected, status: next };
      setJubahAdminSelected(updated);
      setJubahBookings(prev => prev.map(r => r.id === jubahAdminSelected.id ? updated : r));
      showToast(`Status updated: ${JUBAH_STATUS_LABEL[next] ?? next}`);
    }
    setJubahAdminUpdating(false);
  };

  const [showRouteForm, setShowRouteForm] = useState(false);
  const [editingRoute, setEditingRoute]   = useState<Route | null>(null);
  const [routePointA, setRoutePointA]     = useState('');
  const [routePointB, setRoutePointB]     = useState('');
  const [routePrice, setRoutePrice]       = useState('');
  const [savingRoute, setSavingRoute]     = useState(false);

  // Calendar state
  const calUploadRef                              = useRef<HTMLInputElement>(null);
  const [calParsing, setCalParsing]               = useState(false);
  const [calParsed, setCalParsed]                 = useState<any>(null);
  const [calSaving, setCalSaving]                 = useState(false);
  const [calActiveYear, setCalActiveYear]         = useState<string | null>(null);
  const [calPreviewSem, setCalPreviewSem]         = useState(0);

  const loadActiveCalendar = useCallback(async () => {
    const { data } = await supabase
      .from('academic_calendars')
      .select('academic_year')
      .eq('is_active', true)
      .eq('university', 'UMPSA')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setCalActiveYear(data?.academic_year ?? null);
  }, []);

  useEffect(() => { if (activeTab === 'calendar') loadActiveCalendar(); }, [activeTab, loadActiveCalendar]);

  useEffect(() => {
    if (activeTab !== 'jubah' || jubahSubTab !== 'banner') return;
    const urls: Record<string, string> = {};
    BANNER_ITEMS.forEach(b => {
      const { data } = supabase.storage.from(BANNER_BUCKET).getPublicUrl(`${b.key}.jpg`);
      urls[b.key] = `${data.publicUrl}?t=${Date.now()}`;
    });
    setBannerUrls(urls);
    setBannerImgError({});
  }, [activeTab, jubahSubTab]);

  const jubahWaMsg = (name: string, status: string, ref: string, payMode: string, balPaid: boolean, balDue: number) => {
    if (payMode === 'deposit' && !balPaid) {
      return `Assalamualaikum ${name} 🎓\n\nIni peringatan daripada Gerak Jubah.\n\nBaki bayaran anda sebanyak *RM${balDue.toFixed(2)}* masih belum dijelaskan.\n\nSila kemaskini bukti pembayaran melalui akaun Gerak anda sebelum tarikh pengambilan jubah.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`;
    }
    const msgs: Record<string, string> = {
      booked:     `Assalamualaikum ${name} 🎓\n\nTempahan jubah anda telah berjaya diterima oleh Gerak Jubah! ✅\n\nKami akan maklumkan perkembangan seterusnya tidak lama lagi.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`,
      processing: `Assalamualaikum ${name} 🎓\n\nJubah anda sedang dalam proses pembersihan dan pengemasan. 🔄\n\nKami akan maklumkan apabila ia siap untuk diambil.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`,
      collected:  `Assalamualaikum ${name} 🎓\n\nJubah anda telah berjaya diambil! ✅\n\nSila hubungi kami sekiranya ada sebarang pertanyaan.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`,
      at_hub:     `Assalamualaikum ${name} 🎓\n\nJubah anda telah sampai di hab pos. 📦\n\nIa akan dihantar ke alamat anda tidak lama lagi.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`,
      on_the_way: `Assalamualaikum ${name} 🎓\n\nJubah anda sedang dalam perjalanan ke alamat anda! 🚚\n\nSila pastikan anda berada di rumah untuk menerima penghantaran.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`,
      delivered:  `Assalamualaikum ${name} 🎓\n\nJubah anda telah berjaya dihantar! 🎉\n\nTerima kasih kerana menggunakan Gerak Jubah. Semoga majlis konvokesyen anda berjalan lancar! 🎓\n\nRujukan: ${ref}`,
    };
    return msgs[status] ?? `Assalamualaikum ${name} 🎓\n\nIni Gerak Jubah. Terima kasih atas tempahan anda.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`;
  };

  useEffect(() => {
    if (!sampleDocsPage) {
      setSampleUrls({}); setSampleLoaded({}); setDocFields([]);
      return;
    }
    if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;

    const load = async () => {
      let fields: DocField[] = [];
      const { data } = await supabase
        .from('jubah_doc_fields')
        .select('id, label, hint, position')
        .eq('university_key', sampleDocsPage.key)
        .order('position');

      if (data && data.length > 0) {
        fields = data;
      } else {
        // First open for this university — copy from UMPSA defaults
        const { data: defaults } = await supabase
          .from('jubah_doc_fields')
          .select('label, hint, position')
          .eq('university_key', 'umpsa')
          .order('position');
        if (defaults?.length) {
          const { data: inserted } = await supabase
            .from('jubah_doc_fields')
            .insert(defaults.map(d => ({ university_key: sampleDocsPage.key, label: d.label, hint: d.hint, position: d.position })))
            .select('id, label, hint, position');
          fields = inserted ?? [];
        }
      }

      setDocFields(fields);

      const bust = Date.now();
      const urls: Record<string, string> = {};
      fields.forEach(f => {
        const { data: u } = supabase.storage.from(BANNER_BUCKET).getPublicUrl(`samples/${sampleDocsPage.key}/${f.id}.jpg`);
        urls[f.id] = `${u.publicUrl}?t=${bust}`;
      });
      setSampleUrls(urls);
      setSampleLoaded({});
    };

    load();
  }, [sampleDocsPage]);


  const handleSampleUpload = async (file: File, fieldId: string) => {
    if (!sampleDocsPage) return;
    setSampleUploading(fieldId);
    const path = `samples/${sampleDocsPage.key}/${fieldId}.jpg`;
    const { error } = await supabase.storage.from(BANNER_BUCKET).upload(path, file, { upsert: true, contentType: file.type });
    if (error) { showToast('Upload failed: ' + error.message); setSampleUploading(null); return; }
    const { data } = supabase.storage.from(BANNER_BUCKET).getPublicUrl(path);
    setSampleUrls(prev => ({ ...prev, [fieldId]: `${data.publicUrl}?t=${Date.now()}` }));
    setSampleLoaded(prev => ({ ...prev, [fieldId]: true }));
    setSampleUploading(null);
    showToast('Sample uploaded ✓');
  };

  const handleSampleDelete = async (fieldId: string) => {
    if (!sampleDocsPage) return;
    const path = `samples/${sampleDocsPage.key}/${fieldId}.jpg`;
    await supabase.storage.from(BANNER_BUCKET).remove([path]);
    setSampleLoaded(prev => ({ ...prev, [fieldId]: false }));
    showToast('Sample removed.');
  };

  const getCroppedBlob = (image: HTMLImageElement, px: PixelCrop): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth  / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width  = Math.round(px.width  * scaleX);
    canvas.height = Math.round(px.height * scaleY);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, px.x * scaleX, px.y * scaleY, px.width * scaleX, px.height * scaleY, 0, 0, canvas.width, canvas.height);
    return new Promise(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.92));
  };

  const onCropImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { offsetWidth: w, offsetHeight: h } = e.currentTarget;
    const pct = centerCrop(makeAspectCrop({ unit: '%', width: 90 }, w / h, w, h), w, h);
    setCropObj(pct);
    setCompletedCrop({ unit: 'px', x: (pct.x / 100) * w, y: (pct.y / 100) * h, width: (pct.width / 100) * w, height: (pct.height / 100) * h });
  };

  const handleCropConfirm = async () => {
    if (!completedCrop || !cropImgRef.current || !bannerUploadKey) return;
    const blob = await getCroppedBlob(cropImgRef.current, completedCrop);
    setCropSrc('');
    setCropObj(undefined);
    setCompletedCrop(undefined);
    const file = new File([blob], `${bannerUploadKey}.jpg`, { type: 'image/jpeg' });
    handleBannerUpload(file);
  };

  const handleBannerUpload = async (file: File) => {
    if (!bannerUploadKey) return;
    const key = bannerUploadKey;
    setBannerUploading(key);
    const path = `${key}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(BANNER_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      showToast(`Banner upload failed: ${uploadError.message}`);
      setBannerUploading(null);
      return;
    }
    const { data } = supabase.storage.from(BANNER_BUCKET).getPublicUrl(path);
    setBannerUploading(null);
    showToast('Banner uploaded ✓');
    // Give Supabase CDN ~1s to propagate, then force fresh load
    setTimeout(() => {
      setBannerImgError(prev => ({ ...prev, [key]: false }));
      setBannerUrls(prev => ({ ...prev, [key]: `${data.publicUrl}?t=${Date.now()}` }));
      setBannerRefreshKey(prev => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
    }, 1000);
  };

  const handleBannerDelete = async (key: string) => {
    const { error } = await supabase.storage.from(BANNER_BUCKET).remove([`${key}.jpg`]);
    if (error) { showToast('Delete failed: ' + error.message); return; }
    setBannerUrls(prev => ({ ...prev, [key]: '' }));
    setBannerImgError(prev => ({ ...prev, [key]: true }));
    setBannerRefreshKey(prev => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
    showToast('Banner deleted.');
  };

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
    } catch (err) {
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
        .eq('university', 'UMPSA')
        .eq('academic_year', calParsed.academic_year);
      const { error } = await supabase.from('academic_calendars').insert({
        academic_year: calParsed.academic_year,
        university: 'UMPSA',
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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const q = supabase
      .from('ride_orders')
      .select('id,customer_name,campus,date,time,pickup,destination,passengers,contact,fare,night_charge,notes,status,driver_id,driver_name,driver_contact,created_at,accepted_at')
      .eq('campus', campusView)
      .order('created_at', { ascending: false });

    const { data } = await q;
    setOrders((data as RideOrder[]) ?? []);
    setLoading(false);
  }, [campusView]);

  useEffect(() => {
    loadOrders();
    const channel = supabase
      .channel('ride_orders_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_orders' }, loadOrders)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadOrders]);

  const handleDelete = async (orderId: string) => {
    setDeleting(orderId);
    const { error } = await supabase.from('ride_orders').delete().eq('id', orderId);
    setDeleting(null);
    if (error) showToast('Delete failed: ' + error.message);
    else { showToast('Order removed.'); loadOrders(); }
  };

  const handleForceStatus = async (orderId: string, status: string) => {
    await supabase.rpc('update_ride_status', { p_order_id: orderId, p_status: status });
    loadOrders();
  };

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);


  // ── Driver invite helpers ───────────────────────────────────────────────
  const loadInvites = useCallback(async () => {
    setInvitesLoading(true);
    const { data } = await supabase
      .from('driver_invites')
      .select('id,email,campus,role,can_drive,can_rent,used,used_at,created_at')
      .order('created_at', { ascending: false });
    setInvites(data ?? []);
    setInvitesLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'drivers') loadInvites();
  }, [activeTab, loadInvites]);

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) return;
    if (inviteRole === 'driver' && !inviteCanDrive && !inviteCanRent) { showToast('Select at least one capability.'); return; }
    if (inviteRole === 'rider'  && !inviteCanDaily && !inviteCanRobe)  { showToast('Select at least one capability.'); return; }
    setInviteSending(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { error } = await supabase.from('driver_invites').insert({
      email:      inviteEmail.trim().toLowerCase(),
      campus:     inviteCampus,
      role:       inviteRole,
      can_drive:  inviteRole === 'driver' ? inviteCanDrive : false,
      can_rent:   inviteRole === 'driver' ? inviteCanRent  : false,
      can_daily:  inviteRole === 'rider'  ? inviteCanDaily : false,
      can_robe:   inviteRole === 'rider'  ? inviteCanRobe  : false,
      created_by: authUser?.id,
    });
    setInviteSending(false);
    if (error) showToast(error.message.includes('unique') ? 'This email already has a pending invite.' : error.message);
    else {
      showToast('Invite added!');
      setInviteEmail('');
      setInviteRole('driver');
      setInviteCanDrive(true); setInviteCanRent(false);
      setInviteCanDaily(false); setInviteCanRobe(false);
      loadInvites();
    }
  };

  const handleRevokeInvite = async (id: string) => {
    const { error } = await supabase.from('driver_invites').delete().eq('id', id);
    if (error) { showToast('Delete failed: ' + error.message); return; }
    showToast('Invite removed.');
    loadInvites();
  };

  // ── Users management helpers ────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    const { data } = await supabase.rpc('get_all_profiles');
    // Enrich drivers with capability flags from profiles table
    let users = (data as ProfileUser[]) ?? [];
    // Non-superadmin: scope to their campus only
    if (!isSuperAdmin) {
      users = users.filter(u => u.campus.toLowerCase() === adminCampus.toLowerCase());
    }
    const driverIds = users.filter(u => u.role === 'driver').map(u => u.id);
    if (driverIds.length > 0) {
      const { data: caps } = await supabase
        .from('profiles').select('id, can_drive, can_rent').in('id', driverIds);
      if (caps) {
        caps.forEach(c => {
          const u = users.find(u => u.id === c.id);
          if (u) { u.can_drive = c.can_drive; u.can_rent = c.can_rent; }
        });
      }
    }
    const riderIds = users.filter(u => u.role === 'rider').map(u => u.id);
    if (riderIds.length > 0) {
      const { data: caps } = await supabase
        .from('profiles').select('id, can_daily, can_robe').in('id', riderIds);
      if (caps) {
        caps.forEach(c => {
          const u = users.find(u => u.id === c.id);
          if (u) { u.can_daily = c.can_daily; u.can_robe = c.can_robe; }
        });
      }
    }
    const driverRiderIds = [...driverIds, ...riderIds];
    if (driverRiderIds.length > 0) {
      const { data: exempts } = await supabase
        .from('profiles').select('id, receipt_gate_exempt').in('id', driverRiderIds);
      if (exempts) {
        exempts.forEach(c => {
          const u = users.find(u => u.id === c.id);
          if (u) { u.receipt_gate_exempt = c.receipt_gate_exempt; }
        });
      }
    }
    setProfileUsers(users);
    setUsersLoading(false);
  }, [isSuperAdmin, adminCampus]);

  const handleToggleCapability = async (u: ProfileUser, canDrive: boolean, canRent: boolean) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { showToast('Session expired — please log in again.'); return; }
    setTogglingCap(u.id);
    const { error } = await supabase.rpc('set_driver_capabilities', {
      p_user_id:  u.id,
      p_can_drive: canDrive,
      p_can_rent:  canRent,
    });
    setTogglingCap(null);
    if (error) showToast('Failed to update capabilities.');
    else {
      showToast(`${u.name}: ${canDrive ? 'Car ✓' : 'Car ✗'} · ${canRent ? 'Rental ✓' : 'Rental ✗'}`);
      loadUsers();
    }
  };

  const handleToggleRiderCapability = async (u: ProfileUser, canDaily: boolean, canRobe: boolean) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { showToast('Session expired — please log in again.'); return; }
    setTogglingCap(u.id);
    const { error } = await supabase.rpc('set_rider_capabilities', {
      p_user_id:  u.id,
      p_can_daily: canDaily,
      p_can_robe:  canRobe,
    });
    setTogglingCap(null);
    if (error) showToast('Failed to update capabilities.');
    else {
      showToast(`${u.name}: ${canDaily ? 'Daily ✓' : 'Daily ✗'} · ${canRobe ? 'Robe ✓' : 'Robe ✗'}`);
      loadUsers();
    }
  };

  const handleToggleReceiptGateExempt = async (u: ProfileUser) => {
    setTogglingCap(u.id);
    const newExempt = !u.receipt_gate_exempt;
    const { error } = await supabase.rpc('set_receipt_gate_exempt', {
      p_user_id: u.id,
      p_exempt:  newExempt,
    });
    setTogglingCap(null);
    if (error) showToast('Failed to update gate exemption.');
    else {
      showToast(`${u.name}: Gate ${newExempt ? 'Exempted' : 'Enforced'}.`);
      loadUsers();
    }
  };

  const handleChangeCampus = async (u: ProfileUser, campus: 'Pekan' | 'Gambang') => {
    setTogglingCampus(u.id);
    const { error } = await supabase.rpc('set_driver_campus', {
      p_user_id: u.id,
      p_campus:  campus,
    });
    setTogglingCampus(null);
    if (error) showToast('Failed to update campus.');
    else { showToast(`${u.name} moved to UMPSA ${campus}.`); loadUsers(); }
  };

  useEffect(() => {
    if (activeTab === 'users') loadUsers();
  }, [activeTab, loadUsers]);

  const handleToggleRole = async (u: ProfileUser, newRole: 'driver' | 'admin') => {
    const { error } = await supabase.rpc('toggle_user_role', { p_target_id: u.id, p_new_role: newRole });
    if (error) showToast('Failed to change role.');
    else { showToast(`${u.name} is now ${newRole === 'admin' ? 'Admin + Driver' : 'Driver only'}.`); loadUsers(); }
  };

  const executePendingAction = () => {
    if (!pendingAction) return;
    if (pendingAction.type === 'toggle-status') handleToggleStatus(pendingAction.u);
    else if (pendingAction.type === 'terminate')  handleTerminate(pendingAction.u);
    else if (pendingAction.type === 'toggle-cap') handleToggleCapability(pendingAction.u, pendingAction.canDrive, pendingAction.canRent);
    else if (pendingAction.type === 'toggle-rider-cap') handleToggleRiderCapability(pendingAction.u, pendingAction.canDaily, pendingAction.canRobe);
    else if (pendingAction.type === 'campus')     handleChangeCampus(pendingAction.u, pendingAction.campus);
    else if (pendingAction.type === 'toggle-role') handleToggleRole(pendingAction.u, pendingAction.newRole);
    else if (pendingAction.type === 'toggle-gate-exempt') handleToggleReceiptGateExempt(pendingAction.u);
    setPendingAction(null);
  };

  const canManage = (targetRole: string, targetId: string) => {
    if (targetId === (supabase.auth as any)._currentUser?.id) return false;
    if (user.role === 'superadmin') return true;
    if (user.role === 'admin') return !['admin', 'superadmin'].includes(targetRole);
    return false;
  };

  const handleToggleStatus = async (u: ProfileUser) => {
    setTogglingStatus(u.id);
    const newStatus = u.status === 'active' ? 'inactive' : 'active';
    const { data } = await supabase.rpc('set_user_status', { p_user_id: u.id, p_status: newStatus });
    setTogglingStatus(null);
    if (data?.success === false) showToast(data.error ?? 'Failed');
    else { showToast(newStatus === 'inactive' ? `${u.name} suspended.` : `${u.name} reactivated.`); loadUsers(); }
  };

  const handleTerminate = async (u: ProfileUser) => {
    if (!confirm(`Permanently terminate ${u.name} (${u.gerak_id})? This cannot be undone.`)) return;
    setTerminating(u.id);
    const { data } = await supabase.rpc('terminate_user', { p_user_id: u.id });
    setTerminating(null);
    if (data?.success === false) showToast(data.error ?? 'Failed');
    else { showToast(`${u.name} has been terminated.`); loadUsers(); }
  };

  // ── Banner helpers ───────────────────────────────────────────────────────────
  const loadAnnouncements = useCallback(async () => {
    setBannersLoading(true);
    const { data: ann } = await supabase.from('announcements').select('*').order('sort_order').order('created_at', { ascending: false });
    setAnnouncements(ann ?? []);
    setBannersLoading(false);
  }, []);

  useEffect(() => { if (activeTab === 'banners') loadAnnouncements(); }, [activeTab, loadAnnouncements]);

  const handleToggleJubah = async () => {
    setTogglingJubah(true);
    const newVal = (!jubahActive).toString();
    await supabase.from('app_settings').update({ value: newVal }).eq('key', 'jubah_active');
    setJubahActive(!jubahActive);
    setTogglingJubah(false);
    showToast(`Jubah delivery ${!jubahActive ? 'activated' : 'deactivated'}.`);
  };

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
    if (!window.confirm('Delete this banner?')) return;
    await supabase.from('announcements').delete().eq('id', id);
    showToast('Banner deleted.'); loadAnnouncements();
  };

  // ── Receipt review helpers ───────────────────────────────────────────────
  const loadReceipts = useCallback(async () => {
    setReceiptsLoading(true);
    const [{ data }, { data: setting }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, name, gerak_id, campus, email, phone, status, fee_receipt_url, fee_receipt_verified, fee_receipt_amount, fee_receipt_date, fee_receipt_expiry, fee_receipt_reject_reason')
        .eq('role', receiptRoleFilter)
        .order('name'),
      supabase.from('app_settings').select('value').eq('key', 'receipt_gate_active').single(),
    ]);
    setDriverReceipts((data as DriverReceipt[]) ?? []);
    if (setting) setReceiptGateOn(setting.value === 'true');
    setReceiptsLoading(false);
  }, [receiptRoleFilter]);

  useEffect(() => { if (activeTab === 'receipts') loadReceipts(); }, [activeTab, loadReceipts]);

  // ── Driver earnings helpers ──────────────────────────────────────────────
  const loadEarningsLeaderboard = useCallback(async (start: string | null, end: string | null) => {
    setEarningsLoading(true);
    const { data } = await supabase.rpc('get_driver_earnings_leaderboard', { p_start_date: start, p_end_date: end });
    setEarningsLeaderboard((data as DriverEarningsRow[]) ?? []);
    setEarningsLoading(false);
  }, []);

  const loadDriverEarnings = useCallback(async (driverId: string) => {
    setEarningsLoading(true);
    const { data } = await supabase.rpc('get_driver_earnings_history', { p_driver_id: driverId });
    setEarningsHistory((data as EarningsRow[]) ?? []);
    setEarningsLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab !== 'earnings' || earningsDriverId) return;
    const [start, end] = getLeaderboardRange(earningsPeriod, earningsDay, earningsWeekStart, leaderboardMonth);
    loadEarningsLeaderboard(start, end);
  }, [activeTab, earningsDriverId, earningsPeriod, earningsDay, earningsWeekStart, leaderboardMonth, loadEarningsLeaderboard]);

  const handleSelectEarningsDriver = (driverId: string) => {
    setEarningsDriverId(driverId);
    loadDriverEarnings(driverId);
  };

  const handleToggleReceiptGate = async () => {
    setTogglingReceiptGate(true);
    const newVal = (!receiptGateOn).toString();
    await supabase.from('app_settings').update({ value: newVal }).eq('key', 'receipt_gate_active');
    setReceiptGateOn(!receiptGateOn);
    setTogglingReceiptGate(false);
    showToast(`Receipt gate ${!receiptGateOn ? 'enabled' : 'disabled'}.`);
  };

  const receiptStatus = (r: DriverReceipt): 'verified' | 'expired' | 'rejected' | 'pending' => {
    if (!r.fee_receipt_url) return 'pending';
    if (r.fee_receipt_verified && r.fee_receipt_expiry && new Date(r.fee_receipt_expiry) <= new Date()) return 'expired';
    if (r.fee_receipt_verified) return 'verified';
    if (r.fee_receipt_reject_reason) return 'rejected';
    return 'pending';
  };

  const filteredReceipts = (receiptFilter === 'all'
    ? driverReceipts
    : driverReceipts.filter(r => receiptStatus(r) === receiptFilter)
  ).filter(r =>
    !receiptSearch.trim() ||
    r.name.toLowerCase().includes(receiptSearch.toLowerCase()) ||
    r.gerak_id.toLowerCase().includes(receiptSearch.toLowerCase())
  );

  const handleApproveReceipt = async (r: DriverReceipt) => {
    setApprovingReceipt(r.id);
    const { data } = await supabase.rpc('approve_driver_receipt', { p_user_id: r.id });
    setApprovingReceipt(null);
    if (data?.success === false) showToast(data.error ?? 'Failed to approve.');
    else { showToast(`${r.name} approved — active until end of month.`); loadReceipts(); }
  };

  const handleRejectReceipt = async (r: DriverReceipt) => {
    const reason = window.prompt(
      `Rejection reason for ${r.name}:`,
      'Receipt does not meet requirements. Please re-upload a valid RM25.00 bank transfer receipt paid on the 1st–3rd of the month.'
    );
    if (reason === null) return;
    setRejectingReceipt(r.id);
    const { data } = await supabase.rpc('reject_driver_receipt', {
      p_user_id: r.id,
      p_reason:  reason.trim() || 'Receipt rejected by admin.',
    });
    setRejectingReceipt(null);
    if (data?.success === false) showToast(data.error ?? 'Failed to reject.');
    else { showToast(`${r.name}'s receipt rejected.`); loadReceipts(); }
  };

  // ── Routes helpers ──────────────────────────────────────────────────────────
  const loadVerifyDocs = useCallback(async () => {
    setVerifyLoading(true);
    let q = supabase.from('profiles')
      .select('id,name,gerak_id,campus,role,ic_number,ic_url,license_url,docs_status,docs_reject_reason')
      .eq('role', verifyFilter)
      .order('docs_status').order('name');
    if (!isSuperAdmin) q = q.eq('campus', adminCampus);
    const { data } = await q;
    setVerifyDocs((data as VerifyDoc[]) ?? []);
    setVerifyLoading(false);
  }, [verifyFilter, isSuperAdmin, adminCampus]);

  useEffect(() => { if (activeTab === 'verify') loadVerifyDocs(); }, [activeTab, loadVerifyDocs]);

  const handleApproveDoc = async (userId: string) => {
    await supabase.rpc('approve_driver_docs', { p_user_id: userId });
    showToast('Documents approved.');
    loadVerifyDocs();
  };

  const handleRejectDoc = async (userId: string) => {
    if (!rejectReason.trim()) { showToast('Please enter a rejection reason.'); return; }
    await supabase.rpc('reject_driver_docs', { p_user_id: userId, p_reason: rejectReason.trim() });
    showToast('Documents rejected.');
    setRejectingDoc(null);
    setRejectReason('');
    loadVerifyDocs();
  };

  const loadRoutes = useCallback(async () => {
    setRoutesLoading(true);
    const campus = isSuperAdmin ? campusView : adminCampus;
    const { data } = await supabase
      .from('routes')
      .select('id,campus,point_a,point_b,price,is_active,created_at')
      .eq('campus', campus)
      .order('point_a');
    setRoutes(data ?? []);
    setRoutesLoading(false);
  }, [isSuperAdmin, campusView, adminCampus]);

  useEffect(() => { if (activeTab === 'routes') loadRoutes(); }, [activeTab, loadRoutes]);

  const resetRouteForm = () => {
    setRoutePointA(''); setRoutePointB(''); setRoutePrice('');
    setEditingRoute(null); setShowRouteForm(false);
  };

  const handleSaveRoute = async () => {
    if (!routePointA.trim() || !routePointB.trim() || !routePrice.trim()) return;
    setSavingRoute(true);
    const campus = isSuperAdmin ? campusView : adminCampus;
    if (editingRoute) {
      const { error } = await supabase.from('routes').update({
        point_a: routePointA.trim(),
        point_b: routePointB.trim(),
        price: parseFloat(routePrice),
      }).eq('id', editingRoute.id);
      if (error) showToast(error.message);
      else { showToast('Route updated.'); resetRouteForm(); loadRoutes(); }
    } else {
      const { error } = await supabase.from('routes').insert({
        campus,
        point_a: routePointA.trim(),
        point_b: routePointB.trim(),
        price: parseFloat(routePrice),
      });
      if (error) showToast(error.message);
      else { showToast('Route added.'); resetRouteForm(); loadRoutes(); }
    }
    setSavingRoute(false);
  };


  const handleDeleteRoute = async (id: string) => {
    if (!window.confirm('Delete this route?')) return;
    await supabase.from('routes').delete().eq('id', id);
    showToast('Route deleted.');
    loadRoutes();
  };

  const RECEIPT_STATUS_STYLE = {
    verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    expired:  'bg-red-50 text-red-600 border-red-200',
    rejected: 'bg-orange-50 text-orange-600 border-orange-200',
    pending:  'bg-amber-50 text-amber-700 border-amber-200',
  };

  // Guard — redirect non-admin users
  if (!['admin', 'superadmin'].includes(user.role)) {
    setCurrentPage('dashboard');
    return null;
  }

  return (
    <>
    <div ref={mainScrollRef} className="flex-grow bg-white overflow-y-auto overflow-x-hidden no-scrollbar pb-4 px-4 animate-fade-in flex flex-col gap-4 touch-pan-y">

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-50 bg-slate-800 text-white text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-lg text-center animate-fade-in">
          {toast}
        </div>
      )}

      {/* Profile sheet */}
      {sheetUser && <ProfileSheet u={sheetUser} onClose={() => setSheetUser(null)} />}

      {jubahSheetRider && (
        <JubahRiderSheet
          rider={jubahSheetRider}
          method={jubahMethodDraft}
          dropPoint={jubahDropPointDraft}
          saving={savingJubahAssignment}
          assignments={jubahAssignments.filter(a => a.rider_id === jubahSheetRider.id)}
          onMethodChange={m => {
            setJubahMethodDraft(m);
            if (m === 'postage') setJubahDropPointDraft('-');
          }}
          onDropPointChange={setJubahDropPointDraft}
          onSave={handleSaveJubahAssignment}
          onAddAssignment={async (method, dropPoint) => {
            const { error } = await supabase.from('jubah_rider_assignments').insert({
              rider_id:   jubahSheetRider.id,
              drop_point: dropPoint,
              method,
              campus:     jubahSheetRider.campus,
              is_active:  true,
            });
            if (error) { showToast('Failed: ' + error.message); return; }
            showToast('Assignment added.');
            loadJubahData();
          }}
          onDeleteAssignment={async (id) => {
            const { error } = await supabase.from('jubah_rider_assignments').delete().eq('id', id);
            if (error) { showToast('Failed: ' + error.message); return; }
            showToast('Assignment removed.');
            loadJubahData();
          }}
          onClose={() => setJubahSheetRider(null)}
        />
      )}

      {/* Representative Directory row sheet */}
      {dirSheet && (() => {
        const univ = (dirSheet.campus === 'Pekan' || dirSheet.campus === 'Gambang') ? 'UMPSA' : dirSheet.campus;
        const ic   = dirSheet.ic_number ? dirSheet.ic_number.replace(/\D/g,'').slice(0,6) + '-XX-XXXX' : null;
        const waMsg = `Asslammualaikum Jubah rider, saya perlukan 6 digit IC ${ic ?? 'XXXXXX-XX-XXXX'} terakhir awak untuk pengisian representative jubah ${univ}`;
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
            onClick={() => setDirSheet(null)}>
            <div className="w-full max-w-[480px] max-h-[calc(100dvh-3rem)] bg-white rounded-t-3xl shadow-2xl animate-slide-up flex flex-col overflow-y-auto no-scrollbar"
              onClick={e => e.stopPropagation()}>
              <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>
              <div className="flex items-center justify-between px-5 pt-2 pb-4">
                <p className="text-sm font-semibold text-slate-700">Representative</p>
                <button onClick={() => setDirSheet(null)} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-5 flex flex-col gap-4" style={{ paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col gap-3 text-xs">
                  {[
                    { label: 'Representative Name', value: dirSheet.name },
                    { label: 'Drop Point',           value: dirSheet.drop_point || '—' },
                    { label: 'Method',               value: dirSheet.method === 'pickup' ? 'Self Pickup' : 'Pickup & Postage' },
                    { label: 'I/C Number',           value: ic ?? '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-col gap-0.5">
                      <span className="text-xs font-normal text-slate-400">{label}</span>
                      <span className="font-semibold text-slate-800">{value}</span>
                    </div>
                  ))}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-normal text-slate-400">H/P</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{dirSheet.phone || '—'}</span>
                      {dirSheet.phone && (
                        <a href={`https://wa.me/${toWa(dirSheet.phone)}?text=${encodeURIComponent(waMsg)}`}
                          target="_blank" rel="noopener noreferrer" className="text-[#25D366] active:scale-90 transition shrink-0">
                          <WaIcon className="w-5 h-5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Sub-page Standard: replace all tab content when active ── */}
      {sampleDocsPage ? (
        <>
          {/* Hidden file input */}
          <input type="file" ref={sampleFileRef} accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={async e => {
              const file = e.target.files?.[0];
              if (file && currentSampleDoc) await handleSampleUpload(file, currentSampleDoc);
              if (sampleFileRef.current) sampleFileRef.current.value = '';
            }}
          />

          {/* Hidden image probes */}
          <div className="hidden">
            {docFields.map(f => sampleUrls[f.id] && (
              <img key={f.id} src={sampleUrls[f.id]}
                onLoad={() => setSampleLoaded(prev => ({ ...prev, [f.id]: true }))}
                onError={() => setSampleLoaded(prev => ({ ...prev, [f.id]: false }))}
              />
            ))}
          </div>

          {/* Upload Documents (Sample) card */}
          <div className="mt-4 bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4"
            style={{ marginBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}>

            {/* Card header: back + title */}
            <div className="flex items-center gap-3">
              <button onClick={() => setSampleDocsPage(null)}
                className="w-7 h-7 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-90 transition shrink-0">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h3 className="flex-1 text-sm font-semibold text-slate-700">Upload Documents (Sample)</h3>
            </div>

            {/* Doc fields — upload sample image per field */}
            {docFields.map(field => (
              <div key={field.id} className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-slate-600">{field.label}</p>
                {/* Sample image upload */}
                {sampleLoaded[field.id] ? (
                  <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">
                    <img src={sampleUrls[field.id]} alt={field.label} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-emerald-700">Sample uploaded</p>
                      <p className="text-xs text-emerald-500">Tap to replace or remove</p>
                    </div>
                    <button type="button"
                      onClick={() => { setCurrentSampleDoc(field.id); setTimeout(() => sampleFileRef.current?.click(), 0); }}
                      className="text-slate-400 active:scale-90 transition shrink-0 p-1">
                      <Upload className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => handleSampleDelete(field.id)}
                      className="text-slate-400 active:scale-90 transition shrink-0 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button type="button"
                    disabled={sampleUploading === field.id}
                    onClick={() => { setCurrentSampleDoc(field.id); setTimeout(() => sampleFileRef.current?.click(), 0); }}
                    className="w-full border-2 border-dashed border-slate-200 rounded-xl py-3 flex items-center justify-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition cursor-pointer disabled:opacity-50">
                    {sampleUploading === field.id
                      ? <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
                      : <><Upload className="w-4 h-4" /><span className="text-xs font-semibold">Upload {field.label} Sample</span></>
                    }
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (<>

      {/* Sticky header + tab switcher */}
      <div className="sticky top-0 z-10 -mx-4 px-4 pt-4 pb-2 bg-slate-50/95 backdrop-blur-sm flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-800 m-0">Admin Panel</h2>
              <span className="bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                {user.role}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">{user.name} · {user.gerakId}</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Refresh */}
            <button
              onClick={() => activeTab === 'orders' ? loadOrders() : activeTab === 'drivers' ? loadInvites() : activeTab === 'users' ? loadUsers() : activeTab === 'receipts' ? loadReceipts() : activeTab === 'earnings' ? (earningsDriverId ? loadDriverEarnings(earningsDriverId) : loadEarningsLeaderboard(...getLeaderboardRange(earningsPeriod, earningsDay, earningsWeekStart, leaderboardMonth))) : loadAnnouncements()}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-slate-400 hover:text-primary transition active:scale-90"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab bar */}
      <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1 overflow-x-auto no-scrollbar">
        {([
          { id: 'orders',   label: 'Orders',    icon: BarChart3,       superadminOnly: false },
          { id: 'drivers',  label: 'Invite',    icon: Car,             superadminOnly: false },
          { id: 'users',    label: 'Staff',     icon: Users,           superadminOnly: false },
          { id: 'verify',   label: 'Verify',    icon: ShieldCheck,     superadminOnly: false },
          { id: 'jubah',    label: 'Jubah',     icon: GraduationCap,   superadminOnly: false },
          { id: 'banners',  label: 'Banners',   icon: Megaphone,       superadminOnly: false },
          { id: 'routes',   label: 'Routes',    icon: ArrowLeftRight,  superadminOnly: false },
          { id: 'receipts', label: 'Receipts',  icon: FileImage,       superadminOnly: true  },
          { id: 'earnings', label: 'Earnings',  icon: TrendingUp,      superadminOnly: true  },
          { id: 'calendar', label: 'Calendar',  icon: CalendarDays,    superadminOnly: false },
        ] as { id: AdminTab; label: string; icon: React.ElementType; superadminOnly: boolean }[])
          .filter(t => !t.superadminOnly || user.role === 'superadmin')
          .map(tab => (
            <button key={tab.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                activeTab === tab.id ? 'bg-primary text-white' : 'text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
      </div>
      </div>

      {/* ── DRIVERS TAB ── */}
      {activeTab === 'drivers' && (
        <div className="flex flex-col gap-4">
          {/* Invite form */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-primary" /> Invite Staff
            </h3>

            {/* Role selector */}
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Role</p>
              <div className="flex bg-slate-50 border border-slate-200 rounded-2xl p-1 gap-1">
                {([
                  { id: 'driver', label: 'Driver', color: 'bg-primary text-white' },
                  { id: 'rider',  label: 'Rider',  color: 'bg-emerald-600 text-white' },
                  { id: 'admin',  label: 'Admin',  color: 'bg-violet-600 text-white' },
                ] as const).map(r => (
                  <button key={r.id} type="button"
                    onClick={() => {
                      setInviteRole(r.id);
                      setInviteCanDrive(r.id === 'driver');
                      setInviteCanRent(false);
                      setInviteCanDaily(false);
                      setInviteCanRobe(false);
                    }}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${
                      inviteRole === r.id ? r.color : 'text-slate-400'
                    }`}>
                    {r.label}
                  </button>
                ))}
              </div>
              {inviteRole === 'admin' && (
                <p className="text-xs text-violet-500 font-semibold mt-1.5 pl-1">
                  Admin includes full driving capabilities automatically.
                </p>
              )}
            </div>

            {/* Campus picker — superadmin only; regular admin locked to their campus */}
            {isSuperAdmin ? (
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Campus</p>
                <div className="flex bg-slate-50 border border-slate-200 rounded-2xl p-1 gap-1">
                  {(['Gambang', 'Pekan'] as const).map(c => (
                    <button key={c} type="button" onClick={() => setInviteCampus(c)}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${
                        inviteCampus === c ? 'bg-primary text-white' : 'text-slate-400'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5">
                <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                <p className="text-xs font-semibold text-slate-700">UMPSA {adminCampus}</p>
                <span className="text-xs font-normal text-slate-400 ml-auto">campus locked</span>
              </div>
            )}

            {/* Email input */}
            <div className="relative">
              <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && inviteEmail.trim() && setShowInviteConfirm(true)}
                placeholder="staff@email.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
              />
            </div>

            {/* Capability toggles — driver */}
            {inviteRole === 'driver' && (
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Capabilities</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setInviteCanDrive(v => !v)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition active:scale-95 ${
                      inviteCanDrive ? 'bg-white border-slate-900 text-slate-900' : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}>
                    <Car className="w-3 h-3" /> Gerak Car {inviteCanDrive ? '✓' : '✗'}
                  </button>
                  <button type="button" onClick={() => setInviteCanRent(v => !v)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition active:scale-95 ${
                      inviteCanRent ? 'bg-white border-slate-900 text-slate-900' : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}>
                    <KeyRound className="w-3 h-3" /> Rental {inviteCanRent ? '✓' : '✗'}
                  </button>
                </div>
              </div>
            )}

            {/* Capability toggles — rider */}
            {inviteRole === 'rider' && (
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Capabilities</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setInviteCanDaily(v => !v)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition active:scale-95 ${
                      inviteCanDaily ? 'bg-white border-slate-900 text-slate-900' : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}>
                    <Bike className="w-3.5 h-3.5" /> Daily {inviteCanDaily ? '✓' : '✗'}
                  </button>
                  <button type="button" onClick={() => setInviteCanRobe(v => !v)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition active:scale-95 ${
                      inviteCanRobe ? 'bg-white border-slate-900 text-slate-900' : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}>
                    <GraduationCap className="w-3.5 h-3.5" /> Robe {inviteCanRobe ? '✓' : '✗'}
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => {
                if (!inviteEmail.trim()) return;
                if (inviteRole === 'driver' && !inviteCanDrive && !inviteCanRent) { showToast('Select at least one capability.'); return; }
                setShowInviteConfirm(true);
              }}
              disabled={!inviteEmail.trim()}
              className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white font-semibold text-xs py-2.5 rounded-xl transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary/20"
            >
              <Send className="w-3.5 h-3.5" /> Add Invite
            </button>
          </div>

          {/* Search */}
          <div className="bg-white border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Find Staff
            </h3>
            <div className="flex gap-2">
              <input
                type="email"
                value={inviteSearch}
                onChange={e => setInviteSearch(e.target.value)}
                placeholder="Search by email"
                style={{ fontSize: '12px' }}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-700 focus:outline-none focus:border-primary transition placeholder:font-normal"
              />
              <button
                onClick={() => setInviteSearch('')}
                disabled={!inviteSearch.trim()}
                className="px-3.5 bg-primary text-white font-semibold text-xs rounded-lg transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Invite list */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <Mail className="w-4 h-4" /> Invite List
            </h3>

            {invitesLoading ? (
              <div className="flex justify-center py-6">
                <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
              </div>
            ) : invites.filter(inv => !inviteSearch.trim() || inv.email.toLowerCase().includes(inviteSearch.toLowerCase())).length === 0 ? (
              <p className="text-xs text-slate-400 font-semibold text-center py-4">
                {inviteSearch.trim() ? 'No matching invites found' : 'No invites yet'}
              </p>
            ) : (
              <div className="overflow-y-auto no-scrollbar max-h-[360px] flex flex-col gap-2">
                {invites.filter(inv => !inviteSearch.trim() || inv.email.toLowerCase().includes(inviteSearch.toLowerCase())).map(inv => (
                  <div key={inv.id} className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl border ${
                    inv.used ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-100'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{inv.email}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-xs font-normal text-slate-400 uppercase">{inv.campus}</span>
                        {inv.used
                          ? <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">Registered</span>
                          : <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Pending</span>}
                        {inv.can_drive && (
                          <span className="text-xs font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <Car className="w-2.5 h-2.5" /> Car
                          </span>
                        )}
                        {inv.can_rent && (
                          <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <KeyRound className="w-2.5 h-2.5" /> Rental
                          </span>
                        )}
                      </div>
                    </div>
                    {!inv.used && (
                      <button
                        onClick={() => handleRevokeInvite(inv.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-xl bg-red-50 border border-red-100 text-red-400 hover:text-red-600 transition active:scale-90 shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── USERS TAB ── */}
      {activeTab === 'users' && (
        <div className="flex flex-col gap-4">

          {/* Admins & Drivers list */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <Users className="w-4 h-4" /> Admins and Staff
            </h3>

            {/* Search input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={staffSearch}
                onChange={e => setStaffSearch(e.target.value)}
                placeholder="Name or Gerak ID"
                style={{ fontSize: '12px' }}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold text-slate-700 focus:outline-none focus:border-primary transition placeholder:font-normal placeholder:text-slate-400"
              />
              <button
                onClick={() => setStaffSearch('')}
                disabled={!staffSearch.trim()}
                className="px-3.5 bg-primary text-white font-semibold text-xs rounded-xl transition active:scale-95 disabled:opacity-50"
              >
                Clear
              </button>
            </div>

            {/* Filter toggle — scrollable */}
            <div className="flex bg-slate-50 border border-slate-200 rounded-2xl p-1 gap-1 overflow-x-auto no-scrollbar">
              {([
                { id: 'all',     label: 'All' },
                { id: 'drivers', label: 'Drivers' },
                { id: 'riders',  label: 'Riders' },
                { id: 'admins',  label: 'Admins' },
              ] as const).map(f => (
                <button key={f.id} onClick={() => setStaffFilter(f.id)}
                  className={`shrink-0 px-4 py-1.5 rounded-xl text-xs font-semibold transition ${
                    staffFilter === f.id ? 'bg-white text-slate-800' : 'text-slate-400'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto no-scrollbar max-h-[420px] flex flex-col gap-2">
              {usersLoading ? (
                <div className="flex justify-center py-8">
                  <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
                </div>
              ) : (() => {
                const filtered = profileUsers.filter(u => {
                  const roleMatch =
                    staffFilter === 'all'     ? true :
                    staffFilter === 'drivers' ? u.role === 'driver' :
                    staffFilter === 'riders'  ? u.role === 'rider' :
                    ['admin', 'superadmin'].includes(u.role);
                  if (!roleMatch) return false;
                  if (!staffSearch.trim()) return true;
                  const q = staffSearch.toLowerCase();
                  return u.name?.toLowerCase().includes(q) || u.gerak_id?.toLowerCase().includes(q);
                });
                return filtered.length === 0
                  ? <p className="text-xs text-slate-400 text-center py-4">No {staffFilter === 'all' ? 'staff' : staffFilter} found</p>
                  : (
                    <div className="flex flex-col gap-2">
                      {filtered.map(u => (
                        <UserCard key={u.id} u={u} canManage={canManage(u.role, u.id)}
                          togglingStatus={togglingStatus} terminating={terminating}
                          togglingCap={togglingCap} togglingCampus={togglingCampus}
                          onToggle={u => setPendingAction({ type: 'toggle-status', u })}
                          onTerminate={u => setPendingAction({ type: 'terminate', u })}
                          onCapToggle={user.role === 'superadmin' ? (u, canDrive, canRent) => setPendingAction({ type: 'toggle-cap', u, canDrive, canRent }) : undefined}
                          onRiderCapToggle={user.role === 'superadmin' ? (u, canDaily, canRobe) => setPendingAction({ type: 'toggle-rider-cap', u, canDaily, canRobe }) : undefined}
                          onCampusChange={user.role === 'superadmin' ? (u, campus) => setPendingAction({ type: 'campus', u, campus }) : undefined}
                          onGateToggle={user.role === 'superadmin' ? (u => setPendingAction({ type: 'toggle-gate-exempt', u })) : undefined}
                          onRoleToggle={user.role === 'superadmin' ? (u, newRole) => setPendingAction({ type: 'toggle-role', u, newRole }) : undefined}
                          onViewProfile={setSheetUser} />
                      ))}
                    </div>
                  );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── BANNERS TAB ── */}
      {activeTab === 'banners' && (
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
                  <select
                    value={bannerCtaPage}
                    onChange={e => setBannerCtaPage(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
                  >
                    {CTA_PAGES.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
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
                      onClick={() => setBannerGradient(g.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r ${g.value} transition active:scale-95 ${
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
                        onClick={() => handleToggleBanner(a)}
                        className={`flex-1 flex items-center justify-center gap-1.5 font-semibold text-xs py-2 rounded-xl border transition active:scale-95 ${
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
                        onClick={() => handleDeleteBanner(a.id)}
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
      )}

      {/* ── ORDERS TAB ── */}
      {activeTab === 'orders' && (
        <div className="flex flex-col gap-4">
      {/* Campus toggle — superadmin only */}
      {isSuperAdmin && (
        <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1">
          {(['Gambang', 'Pekan'] as const).map(c => (
            <button
              key={c}
              onClick={() => setCampusView(c)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${
                campusView === c
                  ? 'bg-primary text-white'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Filter dropdown */}
      <div ref={filterDropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setShowFilterDropdown(v => !v)}
          className="w-full flex items-center justify-between bg-white border border-slate-100 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 transition active:scale-[0.98]"
        >
          <span className="flex items-center gap-2">
            <span className="text-slate-800 font-semibold uppercase text-xs tracking-wide">
              {filter.replace('_', ' ')}
            </span>
            {filter !== 'all' && orders.filter(o => o.status === filter).length > 0 && (
              <span className="bg-primary/10 text-primary text-xs font-semibold px-1.5 py-0.5 rounded-full">
                {orders.filter(o => o.status === filter).length}
              </span>
            )}
          </span>
          {showFilterDropdown
            ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
            : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
        </button>

        {showFilterDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl z-30 overflow-hidden">
            <div className="max-h-48 overflow-y-auto no-scrollbar">
              {(['all', 'pending', 'accepted', 'in_progress', 'completed', 'cancelled'] as FilterStatus[]).map((f, i, arr) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => { setFilter(f); setShowFilterDropdown(false); }}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold transition ${
                    i < arr.length - 1 ? 'border-b border-slate-100' : ''
                  } ${
                    filter === f
                      ? 'bg-slate-100 text-slate-900 font-semibold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="uppercase text-xs tracking-wide">{f.replace('_', ' ')}</span>
                  {f !== 'all' && orders.filter(o => o.status === f).length > 0 && (
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                      filter === f ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {orders.filter(o => o.status === f).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Orders list */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">
            {filtered.length} Order{filtered.length !== 1 ? 's' : ''}
          </h3>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <Car className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs font-semibold">No orders yet</p>
          </div>
        ) : (
          <div className="overflow-y-auto no-scrollbar max-h-[520px] flex flex-col gap-4">
            {filtered.map(order => (
              <div key={order.id} className="border border-slate-100 rounded-2xl p-5 flex flex-col gap-2.5">
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-black text-slate-800 truncate">{order.customer_name}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border uppercase shrink-0 ${STATUS_COLORS[order.status]}`}>
                        {order.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{order.date} · {order.time}</p>
                  </div>
                  <span className="text-sm font-black text-slate-800 shrink-0">
                    RM{order.fare === 'TBC' ? 'TBC' : (Number(order.fare) + order.night_charge).toFixed(0)}
                  </span>
                </div>

                {/* Route */}
                <div className="bg-slate-50 rounded-xl px-3 py-2 flex flex-col gap-1 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
                    <span className="font-semibold truncate">{order.pickup}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Navigation className="w-3 h-3 text-red-500 shrink-0" />
                    <span className="font-semibold truncate">{order.destination}</span>
                  </div>
                </div>

                {/* Meta */}
                <div className="flex items-center flex-wrap gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {order.passengers} pax
                  </span>
                  <span className="flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {order.contact}
                  </span>
                  {order.night_charge > 0 && (
                    <span className="text-amber-500 font-semibold">Night +RM{order.night_charge}</span>
                  )}
                  {order.driver_name && (
                    <span className="flex items-center gap-1 text-blue-500 font-semibold">
                      <Car className="w-3 h-3" /> {order.driver_name}
                    </span>
                  )}
                </div>

                {order.notes && (
                  <p className="text-xs text-slate-400 italic">"{order.notes}"</p>
                )}

                {/* Admin actions */}
                <div className="flex gap-2 pt-1">
                  {order.status === 'pending' && (
                    <button
                      onClick={() => handleForceStatus(order.id, 'cancelled')}
                      className="flex-1 bg-red-50 border border-red-100 text-red-500 font-semibold text-xs py-2 rounded-xl transition active:scale-95 flex items-center justify-center gap-1"
                    >
                      <Clock className="w-3 h-3" /> Cancel
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(order.id)}
                    disabled={deleting === order.id}
                    className="px-3 bg-slate-50 border border-slate-200 text-slate-400 hover:text-red-500 font-semibold text-xs py-2 rounded-xl transition active:scale-95 flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    {deleting === order.id
                      ? <span className="w-3 h-3 rounded-full border border-slate-400 border-t-transparent animate-spin" />
                      : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
        </div>
      )}

      {/* ── ROUTES TAB ── */}
      {activeTab === 'routes' && (
        <div className="flex flex-col gap-4">

          {/* Campus switcher — superadmin only */}
          {isSuperAdmin && (
            <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1">
              {(['Gambang', 'Pekan'] as const).map(c => (
                <button key={c} onClick={() => setCampusView(c)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${
                    campusView === c ? 'bg-primary text-white' : 'text-slate-400'
                  }`}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Add button */}
          {!showRouteForm && (
            <button onClick={() => setShowRouteForm(true)}
              className="flex items-center justify-center gap-2 bg-primary text-white font-semibold text-xs py-3 rounded-2xl transition active:scale-95 shadow-md shadow-primary/20">
              <Plus className="w-4 h-4" /> Add Route
            </button>
          )}

          {/* Add / Edit form */}
          {showRouteForm && (
            <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-slate-700">
                {editingRoute ? 'Edit Route' : 'New Route'}
              </h3>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-normal text-slate-400">Point A</label>
                <input
                  type="text"
                  value={routePointA}
                  onChange={e => setRoutePointA(e.target.value)}
                  placeholder="e.g. KK1"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
                />
              </div>

              <div className="flex items-center justify-center">
                <ArrowLeftRight className="w-4 h-4 text-slate-300" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-normal text-slate-400">Point B</label>
                <input
                  type="text"
                  value={routePointB}
                  onChange={e => setRoutePointB(e.target.value)}
                  placeholder="e.g. Fakulti Kejuruteraan"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-normal text-slate-400">Price (RM)</label>
                <input
                  type="number"
                  min="0"
                  step="0.50"
                  value={routePrice}
                  onChange={e => setRoutePrice(e.target.value)}
                  placeholder="e.g. 5.00"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={resetRouteForm}
                  className="flex-1 bg-slate-100 text-slate-600 font-semibold text-xs py-2.5 rounded-xl transition active:scale-95">
                  Cancel
                </button>
                <button onClick={handleSaveRoute}
                  disabled={savingRoute || !routePointA.trim() || !routePointB.trim() || !routePrice.trim()}
                  className="flex-1 bg-primary text-white font-semibold text-xs py-2.5 rounded-xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {savingRoute
                    ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    : editingRoute ? 'Save Changes' : 'Add Route'}
                </button>
              </div>
            </div>
          )}

          {/* Routes list */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <ArrowLeftRight className="w-4 h-4" /> Routes — UMPSA {isSuperAdmin ? campusView : adminCampus}
            </h3>

            <div className="overflow-y-auto no-scrollbar max-h-[420px] flex flex-col gap-2">
            {routesLoading ? (
              <div className="flex justify-center py-8">
                <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
              </div>
            ) : routes.length === 0 ? (
              <p className="text-xs text-slate-400 font-semibold text-center py-6">No routes yet. Add one above.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {routes.map(r => (
                  <div key={r.id} className={`rounded-2xl border p-5 flex flex-col gap-2.5 ${r.is_active ? 'bg-white border-slate-100' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                    {/* Route display */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-800">{r.point_a}</p>
                        <div className="flex items-center gap-1 my-0.5">
                          <ArrowLeftRight className="w-3 h-3 text-slate-300 shrink-0" />
                        </div>
                        <p className="text-xs font-black text-slate-800">{r.point_b}</p>
                      </div>
                      <p className="text-sm font-black text-slate-800 shrink-0">RM{Number(r.price).toFixed(2)}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingRoute(r);
                          setRoutePointA(r.point_a);
                          setRoutePointB(r.point_b);
                          setRoutePrice(String(r.price));
                          setShowRouteForm(true);
                        }}
                        className="px-3 bg-slate-50 border border-slate-200 text-slate-500 font-semibold text-xs py-2 rounded-xl transition active:scale-95 flex items-center justify-center gap-1">
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      <button
                        onClick={() => handleDeleteRoute(r.id)}
                        className="px-3 bg-red-50 border border-red-100 text-red-400 font-semibold text-xs py-2 rounded-xl transition active:scale-95 flex items-center justify-center gap-1">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {/* ── VERIFY TAB ── */}
      {activeTab === 'verify' && (
        <div className="flex flex-col gap-4">

          {/* Driver / Rider toggle */}
          <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1">
            {(['driver', 'rider'] as const).map(r => (
              <button key={r} onClick={() => setVerifyFilter(r)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${
                  verifyFilter === r ? 'bg-primary text-white' : 'text-slate-400'
                }`}>
                {r === 'driver' ? 'Drivers' : 'Riders'}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="bg-white border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Find {verifyFilter === 'driver' ? 'Driver' : 'Rider'}
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={verifySearch}
                onChange={e => setVerifySearch(e.target.value)}
                placeholder="Name or Gerak ID"
                style={{ fontSize: '12px' }}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-700 focus:outline-none focus:border-primary transition placeholder:font-normal"
              />
              <button
                onClick={() => setVerifySearch('')}
                disabled={!verifySearch.trim()}
                className="px-3.5 bg-primary text-white font-semibold text-xs rounded-lg transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Doc list */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" /> Document Verification
            </h3>

            <div className="overflow-y-auto no-scrollbar max-h-[520px] flex flex-col gap-4">
            {verifyLoading ? (
              <div className="flex justify-center py-8">
                <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
              </div>
            ) : verifyDocs.filter(d =>
                !verifySearch.trim() ||
                d.name.toLowerCase().includes(verifySearch.toLowerCase()) ||
                d.gerak_id.toLowerCase().includes(verifySearch.toLowerCase())
              ).length === 0 ? (
              <p className="text-xs text-slate-400 font-semibold text-center py-6">No {verifyFilter}s found.</p>
            ) : verifyDocs.filter(d =>
                !verifySearch.trim() ||
                d.name.toLowerCase().includes(verifySearch.toLowerCase()) ||
                d.gerak_id.toLowerCase().includes(verifySearch.toLowerCase())
              ).map(d => (
              <div key={d.id} className="border border-slate-100 rounded-2xl p-5 flex flex-col gap-4">

                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-800 truncate">{d.name}</p>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">{d.gerak_id} · UMPSA {d.campus}</p>
                    {d.ic_number && (
                      <p className="text-xs font-semibold text-slate-500 mt-0.5">IC: {d.ic_number}</p>
                    )}
                    {!d.ic_number && (
                      <p className="text-xs font-semibold text-amber-500 mt-0.5">IC number not set yet</p>
                    )}
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full border shrink-0 ${
                    d.docs_status === 'approved' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                    d.docs_status === 'rejected' ? 'bg-red-50 border-red-100 text-red-600' :
                    d.docs_status === 'pending'  ? 'bg-amber-50 border-amber-100 text-amber-700' :
                    'bg-slate-50 border-slate-200 text-slate-400'
                  }`}>
                    {d.docs_status === 'approved' ? '✓ Approved' :
                     d.docs_status === 'rejected' ? '✗ Rejected' :
                     d.docs_status === 'pending'  ? '⏳ Pending' : 'Not Uploaded'}
                  </span>
                </div>

                {/* Reject reason */}
                {d.docs_status === 'rejected' && d.docs_reject_reason && (
                  <p className="text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-3 py-2">
                    Reason: {d.docs_reject_reason}
                  </p>
                )}

                {/* Document links */}
                <div className="grid grid-cols-2 gap-2">
                  <a href={d.ic_url ?? '#'} target="_blank" rel="noopener noreferrer"
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition ${
                      d.ic_url ? 'bg-blue-50 border-blue-100 text-blue-600 active:scale-95' : 'bg-slate-50 border-slate-200 text-slate-300 pointer-events-none'
                    }`}>
                    <ExternalLink className="w-3 h-3" /> IC (MyKad)
                  </a>
                  <a href={d.license_url ?? '#'} target="_blank" rel="noopener noreferrer"
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition ${
                      d.license_url ? 'bg-blue-50 border-blue-100 text-blue-600 active:scale-95' : 'bg-slate-50 border-slate-200 text-slate-300 pointer-events-none'
                    }`}>
                    <ExternalLink className="w-3 h-3" /> License
                  </a>
                </div>

                {/* Reject reason input */}
                {rejectingDoc === d.id && (
                  <div className="flex flex-col gap-2">
                    <input
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="Reason for rejection..."
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-primary transition"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleRejectDoc(d.id)}
                        className="flex-1 bg-red-500 text-white text-xs font-semibold py-2 rounded-xl active:scale-95 transition">
                        Confirm Reject
                      </button>
                      <button onClick={() => { setRejectingDoc(null); setRejectReason(''); }}
                        className="flex-1 bg-slate-100 text-slate-500 text-xs font-semibold py-2 rounded-xl active:scale-95 transition">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                {d.docs_status !== 'approved' && rejectingDoc !== d.id && (d.ic_url || d.license_url) && (
                  <div className="flex gap-2">
                    <button onClick={() => handleApproveDoc(d.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 text-white text-xs font-semibold py-2.5 rounded-xl active:scale-95 transition">
                      <ShieldCheck className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button onClick={() => { setRejectingDoc(d.id); setRejectReason(''); }}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 border border-red-100 text-red-500 text-xs font-semibold py-2.5 rounded-xl active:scale-95 transition">
                      <ShieldOff className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                )}

                {d.docs_status === 'approved' && (
                  <button onClick={() => { setRejectingDoc(d.id); setRejectReason(''); }}
                    className="w-full flex items-center justify-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-400 text-xs font-semibold py-2 rounded-xl active:scale-95 transition">
                    <ShieldOff className="w-3 h-3" /> Revoke Approval
                  </button>
                )}
              </div>
            ))}
            </div>
          </div>
        </div>
      )}

      {/* ── JUBAH TAB ── */}
      {activeTab === 'jubah' && (
        <div className="flex flex-col gap-4">

          {/* Jubah Period Toggle + sub-tab switcher — hidden when inside customer sub-pages */}
          {!(jubahSubTab === 'customer' && jubahAdminView !== 'list') && (<>
            <div className="bg-white border border-slate-100 rounded-3xl p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${jubahActive ? 'bg-blue-50' : 'bg-slate-100'}`}>
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-800">Jubah Delivery Period</p>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">
                    {jubahActive ? 'Currently OPEN — students can book' : 'Currently CLOSED — booking disabled'}
                  </p>
                </div>
              </div>
              <button onClick={handleToggleJubah} disabled={togglingJubah}
                className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold border transition active:scale-95 disabled:opacity-50 ${
                  jubahActive ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}>
                {togglingJubah ? '…' : jubahActive ? <><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1" />ON</> : <><span className="inline-block w-2 h-2 rounded-full bg-slate-400 mr-1" />OFF</>}
              </button>
            </div>

            {/* Customer | Rider | Price sub-tabs */}
            <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1">
              {([
                { id: 'rider',    label: 'Rider' },
                { id: 'customer', label: 'Customer' },
                { id: 'price',    label: 'Price' },
                { id: 'banner',   label: 'Banner' },
              ] as const).map(t => (
                <button key={t.id} onClick={() => { setJubahSubTab(t.id); setJubahAdminView('list'); setJubahAdminSelected(null); }}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${
                    jubahSubTab === t.id ? 'bg-primary text-white' : 'text-slate-400'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </>)}

          {/* ── RIDER sub-tab ── */}
          {jubahSubTab === 'rider' && (<>

            {/* Rider cards — click to open assignment sheet */}
            <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4" /> Jubah Riders
              </h3>
              <div className="overflow-y-auto no-scrollbar max-h-[320px] flex flex-col gap-2">
                {jubahRidersLoading ? (
                  <div className="flex justify-center py-8">
                    <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
                  </div>
                ) : jubahRiders.length === 0 ? (
                  <p className="text-xs text-slate-400 font-semibold text-center py-6">No Jubah riders found.</p>
                ) : jubahRiders.map(r => (
                  <button key={r.id} type="button"
                    onClick={() => {
                      setJubahSheetRider(r);
                      setJubahMethodDraft((r.jubah_method as 'pickup' | 'postage') || '');
                      setJubahDropPointDraft(r.jubah_drop_point || '');
                    }}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl border border-slate-100 bg-white active:opacity-70 transition text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{r.name}</p>
                      <p className="text-xs text-slate-400 font-semibold mt-0.5">{r.gerak_id} · UMPSA {r.campus}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full border shrink-0 ${
                      r.status === 'active' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}>
                      {r.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Rider directory table */}
            {jubahAssignments.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <Users className="w-4 h-4" /> Representative Directory
                </h3>
                <div className="overflow-x-auto overflow-y-auto no-scrollbar max-h-[320px]">
                  <table className="text-left border-collapse" style={{ minWidth: 480 }}>
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-xs font-normal text-slate-400 border-b border-slate-100">
                        <th className="py-2 pr-4 whitespace-nowrap">Method</th>
                        <th className="py-2 pr-4 whitespace-nowrap">Representative Name</th>
                        <th className="py-2 pr-4 whitespace-nowrap">I/C Number</th>
                        <th className="py-2 whitespace-nowrap">H/P</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jubahAssignments.map(a => {
                        return (
                          <tr key={a.id}
                            onClick={() => setDirSheet(a)}
                            className="border-b border-slate-100 text-xs cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition">
                            <td className="py-2.5 pr-4 text-slate-600 font-semibold align-top whitespace-nowrap">
                              {a.method === 'pickup' ? 'Self Pickup' : a.method === 'postage' ? 'Pickup & Postage' : '—'}
                            </td>
                            <td className="py-2.5 pr-4 font-semibold text-slate-800 align-top">{a.name}</td>
                            <td className="py-2.5 pr-4 font-mono text-slate-700 align-top whitespace-nowrap">{a.ic_number || '—'}</td>
                            <td className="py-2.5 text-slate-700 font-semibold align-top whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span>{a.phone || '—'}</span>
                                {a.phone && (
                                  <a href={`https://wa.me/${toWa(a.phone)}`} target="_blank" rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()} className="text-[#25D366] active:scale-90 transition shrink-0">
                                    <WaIcon className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>)}

          {/* ── CUSTOMER sub-tab ── */}
          {jubahSubTab === 'customer' && (<>

            {/* PAGE 1 — List + search */}
            {jubahAdminView === 'list' && (<>

              {/* Search bar */}
              <div className="bg-white border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-2">
                <div className="flex gap-2">
                  <input type="text" value={jubahSearch} onChange={e => setJubahSearch(e.target.value)}
                    placeholder="Search by name, phone or reference…"
                    style={{ fontSize: '12px' }}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-700 focus:outline-none focus:border-primary transition placeholder:font-normal placeholder:text-slate-300"
                  />
                  <button onClick={() => { setJubahSearch(''); setJubahPayFilter('all'); }}
                    disabled={!jubahSearch.trim() && jubahPayFilter === 'all'}
                    className="px-3.5 bg-primary text-white font-semibold text-xs rounded-lg transition active:scale-95 disabled:opacity-40 flex items-center gap-1.5">
                    Clear
                  </button>
                  <button onClick={loadJubahData}
                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-slate-400 hover:text-primary transition active:scale-90 shrink-0">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {/* Payment status filter */}
                <div className="flex bg-slate-100 rounded-xl p-0.5 gap-0.5">
                  {([
                    { id: 'all',    label: 'All' },
                    { id: 'booked', label: 'Booked' },
                    { id: 'paid',   label: 'Paid' },
                  ] as const).map(f => (
                    <button key={f.id} onClick={() => setJubahPayFilter(f.id)}
                      className={`flex-1 py-1.5 rounded-[10px] text-xs font-semibold transition active:scale-95 ${
                        jubahPayFilter === f.id ? 'bg-white text-slate-800' : 'text-slate-400'
                      }`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Customer bookings table */}
              <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Users className="w-4 h-4" /> Customer Directory</span>
                  <span className="font-normal text-slate-300 normal-case tracking-normal">
                    {jubahBookings.filter(b => {
                      const isPaid = b.payment_mode !== 'deposit' || b.balance_paid;
                      const matchFilter = jubahPayFilter === 'all' ? true : jubahPayFilter === 'paid' ? isPaid : !isPaid;
                      const q = jubahSearch.trim().toLowerCase();
                      const matchSearch = !q || b.full_name.toLowerCase().includes(q) || b.hp_number.includes(q) || b.reference.toLowerCase().includes(q);
                      return matchFilter && matchSearch;
                    }).length} bookings
                  </span>
                </h3>

                {jubahBookingsLoading ? (
                  <div className="flex justify-center py-8"><span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" /></div>
                ) : jubahBookings.length === 0 ? (
                  <p className="text-xs text-slate-400 font-semibold text-center py-6">No Jubah bookings yet.</p>
                ) : (
                  <div className="overflow-x-auto overflow-y-auto no-scrollbar max-h-[600px]">
                    <table className="min-w-full border-collapse text-left" style={{ minWidth: 360 }}>
                      <thead className="sticky top-0 bg-white">
                        <tr className="text-xs font-normal text-slate-400 border-b border-slate-100">
                          <th className="py-2 pr-4 whitespace-nowrap">Reference</th>
                          <th className="py-2 pr-4 whitespace-nowrap">Name</th>
                          <th className="py-2 pr-4 whitespace-nowrap">Remark</th>
                          <th className="py-2 pr-4 whitespace-nowrap">Mode</th>
                          <th className="py-2 pr-4 whitespace-nowrap">Status</th>
                          <th className="py-2 whitespace-nowrap">Confirm</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jubahBookings.filter(b => {
                          const isPaid = b.payment_mode !== 'deposit' || b.balance_paid;
                          const matchFilter = jubahPayFilter === 'all' ? true : jubahPayFilter === 'paid' ? isPaid : !isPaid;
                          const q = jubahSearch.trim().toLowerCase();
                          const matchSearch = !q || b.full_name.toLowerCase().includes(q) || b.hp_number.includes(q) || b.reference.toLowerCase().includes(q);
                          return matchFilter && matchSearch;
                        }).map(b => {
                          const isPaid = b.payment_mode !== 'deposit' || b.balance_paid;
                          return (
                            <tr key={b.id}
                              onClick={() => goToAdminCard(b)}
                              className="border-b border-slate-100 text-xs hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer">
                              <td className="py-2.5 pr-4 font-mono font-semibold text-primary whitespace-nowrap">{b.reference}</td>
                              <td className="py-2.5 pr-4 font-semibold text-slate-800 whitespace-nowrap">{b.full_name}</td>
                              <td className="py-2.5 pr-4 text-slate-500 font-semibold whitespace-nowrap">{b.remark}</td>
                              <td className="py-2.5 pr-4 whitespace-nowrap">
                                <span className={`font-semibold px-2 py-0.5 rounded-full border text-xs ${
                                  b.payment_mode === 'deposit' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                                  b.payment_mode === 'postage' ? 'bg-blue-50 border-blue-100 text-blue-700' :
                                  'bg-slate-50 border-slate-200 text-slate-600'
                                }`}>
                                  {b.payment_mode === 'deposit' ? 'Deposit' : b.payment_mode === 'postage' ? 'Postage' : 'Pickup'}
                                </span>
                              </td>
                              <td className="py-2.5 pr-4 whitespace-nowrap">
                                <span className={`font-semibold px-2 py-0.5 rounded-full border text-xs ${
                                  isPaid ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700'
                                }`}>
                                  {isPaid ? 'Paid' : 'Booked'}
                                </span>
                              </td>
                              <td className="py-2.5 whitespace-nowrap">
                                {(() => {
                                  const confirmed = b.payment_mode === 'deposit'
                                    ? b.balance_paid
                                    : b.status !== 'ordered';
                                  return (
                                    <CheckCircle2 className={`w-4 h-4 ${confirmed ? 'text-emerald-500' : 'text-slate-200'}`} />
                                  );
                                })()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>)}

            {/* PAGE 2 — Job card with stepper */}
            {jubahAdminView === 'card' && jubahAdminSelected && (() => {
              const b      = jubahAdminSelected;
              const steps  = jubahGetSteps(b.payment_mode);
              const curStep = steps.indexOf(b.status);
              const nextStat = (() => {
                const idx = steps.indexOf(b.status);
                return idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : null;
              })();
              const isDone = !nextStat;
              return (
                <div className="flex flex-col gap-4">
                  {/* Back row */}
                  <div className="flex items-center gap-2">
                    <button onClick={goAdminBack}
                      className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-slate-500 hover:text-primary transition active:scale-90 shrink-0">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-black text-slate-700">{b.reference}</p>
                        <button
                          onClick={() => { navigator.clipboard.writeText(b.reference); setCopiedRef(true); setTimeout(() => setCopiedRef(false), 2000); }}
                          className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-primary active:scale-90 transition"
                        >
                          {copiedRef ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 font-semibold">{b.full_name}</p>
                    </div>
                  </div>

                  {/* Status stepper card */}
                  <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">

                    {/* Customer summary */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-primary font-semibold">{b.reference}</p>
                        <h3 className="text-base font-black text-slate-800 mt-0.5">{b.full_name}</h3>
                        <p className="text-xs text-slate-400 font-semibold mt-0.5">
                          {b.remark} · {b.faculty} · UMPSA {b.campus}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${JUBAH_STATUS_STYLE[b.status] ?? ''}`}>
                        {JUBAH_STATUS_LABEL[b.status] ?? b.status}
                      </span>
                    </div>

                    {/* HP + Mode */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 flex-1">
                        <span className="text-xs font-semibold text-slate-600">{b.hp_number}</span>
                        <a href={`https://wa.me/${toWa(b.hp_number)}?text=${encodeURIComponent(
                          jubahWaMsg(b.full_name, b.status, b.reference, b.payment_mode, b.balance_paid, b.balance_due)
                        )}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-[#25D366] ml-auto shrink-0">
                          <WaIcon className="w-4 h-4" />
                        </a>
                      </div>
                      <span className={`text-xs font-semibold px-3 py-2 rounded-xl border shrink-0 ${
                        b.payment_mode === 'deposit' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                        b.payment_mode === 'postage' ? 'bg-blue-50 border-blue-100 text-blue-700' :
                        'bg-slate-50 border-slate-200 text-slate-600'
                      }`}>
                        {b.payment_mode === 'deposit' ? 'Deposit' : b.payment_mode === 'postage' ? 'Postage' : 'Pickup'}
                      </span>
                    </div>

                    {/* Progress stepper */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-1">
                        {steps.map((step, i) => (
                          <React.Fragment key={step}>
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[8px] font-semibold border-2 transition ${
                              i < curStep  ? 'bg-primary border-primary text-white' :
                              i === curStep ? 'bg-white border-primary text-primary' :
                              'bg-white border-slate-200 text-slate-300'
                            }`}>
                              {i < curStep ? '✓' : i + 1}
                            </div>
                            {i < steps.length - 1 && (
                              <div className={`flex-1 h-0.5 rounded-full transition ${i < curStep ? 'bg-primary' : 'bg-slate-200'}`} />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                      <div className="flex justify-between">
                        {steps.map(step => (
                          <span key={step} className="text-[8px] font-semibold text-slate-400 flex-1 text-center first:text-left last:text-right">
                            {JUBAH_STATUS_LABEL[step]}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Delivery address (postage only) */}
                    {b.payment_mode === 'postage' && b.delivery_address && (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                        <p className="text-[8px] font-semibold text-blue-400 mb-1">Delivery Address</p>
                        <p className="text-xs font-semibold text-blue-800 leading-relaxed">{b.delivery_address}</p>
                      </div>
                    )}

                    {/* Balance status (deposit) */}
                    {b.payment_mode === 'deposit' && (
                      <div className={`rounded-xl p-3 border flex items-center justify-between gap-2 ${
                        b.balance_paid ? 'bg-emerald-50 border-emerald-100' : b.balance_proof_url ? 'bg-violet-50 border-violet-100' : 'bg-amber-50 border-amber-100'
                      }`}>
                        <div>
                          <span className={`text-[8px] font-semibold uppercase tracking-wider block ${
                            b.balance_paid ? 'text-emerald-500' : b.balance_proof_url ? 'text-violet-500' : 'text-amber-500'
                          }`}>
                            {b.balance_paid ? 'Balance Paid' : b.balance_proof_url ? 'Proof Submitted — Review' : 'Balance Due'}
                          </span>
                          <span className={`text-base font-black ${
                            b.balance_paid ? 'text-emerald-700' : b.balance_proof_url ? 'text-violet-700' : 'text-amber-700'
                          }`}>
                            RM{b.balance_due.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {b.balance_proof_url && (
                            <a href={b.balance_proof_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-500 font-semibold flex items-center gap-0.5 hover:underline">
                              <ExternalLink className="w-2.5 h-2.5" /> proof
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Advance status button */}
                    {!isDone && b.status !== 'cancelled' && (
                      <button
                        onClick={handleAdminAdvanceStatus}
                        disabled={jubahAdminUpdating}
                        className="w-full bg-primary hover:bg-primary-hover active:scale-[0.98] disabled:bg-slate-200 text-white font-semibold py-3 rounded-2xl transition flex items-center justify-center gap-2 text-sm">
                        {jubahAdminUpdating
                          ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                          : `→ ${JUBAH_NEXT_LABEL[nextStat ?? ''] ?? `Mark ${JUBAH_STATUS_LABEL[nextStat ?? '']}`}`}
                      </button>
                    )}
                    {isDone && b.status !== 'cancelled' && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 text-center">
                        <p className="text-xs font-semibold text-emerald-700">✓ Delivery Complete</p>
                      </div>
                    )}

                    {/* Mark Balance Paid */}
                    {b.payment_mode === 'deposit' && b.balance_proof_url && !b.balance_paid && (
                      <button
                        onClick={async () => {
                          const { data } = await supabase.rpc('mark_jubah_balance_paid', { p_booking_id: b.id });
                          if (data?.success) {
                            const updated = { ...b, balance_paid: true };
                            setJubahBookings(prev => prev.map(r => r.id === b.id ? updated : r));
                            setJubahAdminSelected(updated);
                            showToast('Balance marked as paid.');
                          }
                        }}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-semibold py-3 rounded-2xl text-sm transition">
                        ✓ Mark Balance Paid
                      </button>
                    )}
                  </div>

                  {/* View Customer Details button */}
                  <button
                    onClick={goToAdminDetails}
                    className="w-full bg-white border border-slate-100 text-slate-600 font-semibold py-3 rounded-2xl text-sm transition active:scale-95 active:bg-slate-50">
                    View Customer Details →
                  </button>
                </div>
              );
            })()}

            {/* PAGE 3 — Customer details (read-only form + downloads) */}
            {jubahAdminView === 'details' && jubahAdminSelected && (() => {
              const b = jubahAdminSelected;
              return (
                <div className="flex flex-col gap-4">
                  {/* Back row */}
                  <div className="flex items-center gap-2">
                    <button onClick={goAdminBack}
                      className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-slate-500 hover:text-primary transition active:scale-90 shrink-0">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <p className="text-xs font-black text-slate-700">Customer Info</p>
                      <p className="text-xs text-slate-400 font-semibold">{b.remark} · {b.university}</p>
                    </div>
                  </div>

                  {/* Form fields card */}
                  <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
                    <h3 className="text-sm font-semibold text-slate-700">Booking Information</h3>

                    {([
                      { label: 'Full Name',     value: b.full_name },
                      { label: 'IC Number',      value: b.ic_number },
                      { label: 'Phone',          value: b.hp_number },
                      { label: 'Matric No.',     value: b.matric_id },
                      { label: 'University',     value: b.university },
                      { label: 'Campus',         value: `UMPSA ${b.campus}` },
                      { label: 'Faculty',        value: b.faculty },
                      { label: 'Remark',         value: b.remark },
                      { label: 'Payment Mode',   value: b.payment_mode.charAt(0).toUpperCase() + b.payment_mode.slice(1) },
                      { label: 'Service Fee',    value: `RM${b.cost.toFixed(2)}` },
                      ...(b.payment_mode === 'deposit' ? [{ label: 'Balance Due', value: `RM${b.balance_due.toFixed(2)}` }] : []),
                      ...(b.delivery_address ? [{ label: 'Delivery Address', value: b.delivery_address }] : []),
                      { label: 'Rider Assigned', value: b.rider_name ?? '—' },
                      { label: 'Reference',      value: b.reference },
                    ] as { label: string; value: string }[]).map(({ label, value }) => (
                      <div key={label} className="flex flex-col gap-0.5 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                        <span className="text-xs font-normal text-slate-400">{label}</span>
                        <span className="text-sm font-semibold text-slate-700 leading-relaxed">{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Documents download card */}
                  <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
                    <h3 className="text-sm font-semibold text-slate-700">Documents</h3>

                    {([
                      { label: 'Combined PDF',  url: b.docs_path },
                      { label: 'Payment Proof', url: b.payment_path },
                      { label: 'OSCAR',         url: b.oscar_path },
                      { label: 'SKPG',          url: b.skpg_path },
                      { label: 'Konvo Slip',    url: b.konvo_path },
                      { label: 'IC Copy',       url: b.ic_path },
                      ...(b.payment_mode === 'deposit' ? [{ label: 'Balance Proof', url: b.balance_proof_url }] : []),
                    ] as { label: string; url: string | null }[]).map(({ label, url }) => (
                      <div key={label} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                        <span className="text-sm font-semibold text-slate-700">{label}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* View — signed URL generated on demand, not stored */}
                          <button
                            type="button"
                            disabled={!url}
                            onClick={async () => {
                              const signed = await getJubahDocSignedUrl(url);
                              if (signed) window.open(signed, '_blank', 'noopener,noreferrer');
                            }}
                            className={`w-9 h-9 flex items-center justify-center rounded-xl border transition ${
                              url
                                ? 'bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100 active:scale-95'
                                : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                            }`}>
                            <Eye className="w-4 h-4" />
                          </button>
                          {/* Download — signed URL with download disposition, generated on demand */}
                          <button
                            type="button"
                            disabled={!url}
                            onClick={async () => {
                              const signed = await getJubahDocSignedUrl(url, true);
                              if (signed) window.open(signed, '_blank', 'noopener,noreferrer');
                            }}
                            className={`w-9 h-9 flex items-center justify-center rounded-xl border transition ${
                              url
                                ? 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700 active:scale-95'
                                : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                            }`}>
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Confirm + Delete row */}
                  {(() => {
                    const canConfirmPayment = b.status === 'ordered' && !!b.payment_path;
                    const canConfirmBalance = b.payment_mode === 'deposit' && !!b.balance_proof_url && !b.balance_paid;
                    const confirmActive = canConfirmPayment || canConfirmBalance;
                    const confirmLabel  = canConfirmBalance ? 'Confirm Balance' : 'Confirm Payment';
                    return (
                      <div className="flex gap-3">
                        <button
                          onClick={handleConfirmJubahBooking}
                          disabled={!confirmActive || confirmingBooking}
                          className="flex-1 flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-100 active:scale-[0.98] font-semibold py-3 rounded-2xl text-sm transition disabled:opacity-40 disabled:cursor-not-allowed">
                          {confirmingBooking
                            ? <span className="w-4 h-4 rounded-full border-2 border-emerald-300 border-t-emerald-600 animate-spin" />
                            : <><BadgeCheck className="w-4 h-4" />{confirmLabel}</>}
                        </button>
                        <button
                          onClick={async () => {
                            setJubahAdminView('list');
                            setJubahAdminSelected(null);
                            await handleDeleteJubahBooking(b);
                          }}
                          disabled={deletingBooking === b.id}
                          className="flex-1 flex items-center justify-center gap-2 border border-red-200 text-red-500 hover:bg-red-50 active:scale-[0.98] font-semibold py-3 rounded-2xl text-sm transition disabled:opacity-50">
                          {deletingBooking === b.id
                            ? <span className="w-4 h-4 rounded-full border-2 border-red-300 border-t-red-500 animate-spin" />
                            : <><Trash2 className="w-4 h-4" />Delete</>}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

          </>)}

          {/* ── PRICE sub-tab ── */}
          {jubahSubTab === 'price' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4" /> Jubah Pricing Matrix
              </h3>
              <p className="text-xs text-slate-400 font-semibold -mt-2">Set price per study level × service option. Tap Save after editing each value.</p>

              {(['Master', 'PHD', 'Degree', 'Diploma'] as const).map(remark => (
                <div key={remark} className="border border-slate-100 rounded-2xl p-5 flex flex-col gap-4">
                  <p className="text-xs font-black text-slate-700">{remark}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['pickup', 'postage'] as const).map(mode => {
                      const key = `${remark}_${mode}`;
                      return (
                        <div key={mode} className="flex flex-col gap-1.5">
                          <label className="text-xs font-normal text-slate-400">
                            {mode === 'pickup' ? 'Self Pickup' : 'Pickup & Postage'}
                          </label>
                          <div className="flex gap-1.5">
                            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 gap-1 flex-1 focus-within:border-primary transition">
                              <span className="text-xs font-normal text-slate-400 shrink-0">RM</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={priceDrafts[key] ?? ''}
                                onChange={e => setPriceDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                                style={{ fontSize: '12px' }}
                                className="flex-1 bg-transparent font-semibold text-slate-700 focus:outline-none w-0"
                              />
                            </div>
                            <button
                              onClick={() => handleSavePrice(remark, mode)}
                              disabled={savingPrice === key}
                              className="shrink-0 bg-primary text-white font-semibold text-xs px-2.5 py-2 rounded-xl transition active:scale-95 disabled:opacity-50"
                            >
                              {savingPrice === key ? '…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── BANNER sub-tab ── */}
          {jubahSubTab === 'banner' && (
            <div className="flex flex-col gap-4">

              <input
                type="file"
                ref={bannerFileRef}
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = () => { setCropSrc(reader.result as string); setCropObj(undefined); setCompletedCrop(undefined); };
                    reader.readAsDataURL(file);
                  }
                  if (bannerFileRef.current) bannerFileRef.current.value = '';
                }}
              />
              {BANNER_ITEMS.map(item => (
                <div key={item.key} className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-700 flex-1 min-w-0">{item.label}</h3>
                    {item.key !== 'default' && (
                      <button
                        onClick={() => setSampleDocsPage({ key: item.key, label: item.label })}
                        className="w-7 h-7 flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 active:scale-90 active:bg-slate-100 transition shrink-0">
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="w-full rounded-2xl overflow-hidden border border-slate-100 bg-slate-50">
                    {bannerUrls[item.key] && !bannerImgError[item.key] ? (
                      <img
                        key={`${item.key}-${bannerRefreshKey[item.key] ?? 0}`}
                        src={bannerUrls[item.key]}
                        alt={`${item.label} banner`}
                        className="w-full h-auto block"
                        onError={() => setBannerImgError(prev => ({ ...prev, [item.key]: true }))}
                      />
                    ) : (
                      <div className="min-h-[120px] flex flex-col items-center justify-center gap-2 text-slate-300 p-4 text-center">
                        <FileImage className="w-10 h-10" />
                        <span className="text-xs font-semibold">No banner uploaded yet</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={bannerUploading === item.key}
                      onClick={() => { setBannerUploadKey(item.key); setTimeout(() => bannerFileRef.current?.click(), 0); }}
                      className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-2.5 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition text-xs font-semibold disabled:opacity-50"
                    >
                      {bannerUploading === item.key ? (
                        <><span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" /> Uploading…</>
                      ) : (
                        <><Upload className="w-3.5 h-3.5" /> Upload Banner</>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={!bannerUrls[item.key] || bannerImgError[item.key]}
                      onClick={() => handleBannerDelete(item.key)}
                      className="flex-1 flex items-center justify-center border-2 border-dashed border-red-200 rounded-xl py-2.5 text-red-400 hover:border-red-400 hover:text-red-500 hover:bg-red-50/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── RECEIPTS TAB (superadmin only) ── */}
      {activeTab === 'receipts' && user.role === 'superadmin' && (
        <div className="flex flex-col gap-4">

          {/* Master Receipt Gate Toggle — superadmin only */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${receiptGateOn ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                <ShieldCheck className={`w-5 h-5 ${receiptGateOn ? 'text-emerald-500' : 'text-slate-400'}`} />
              </div>
              <div>
                <p className="text-xs font-black text-slate-800">Receipt Gate</p>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                  {receiptGateOn ? 'ON — monthly receipt required to be active' : 'OFF — everyone bypasses the receipt requirement'}
                </p>
              </div>
            </div>
            <button onClick={() => setShowGateMasterConfirm(true)} disabled={togglingReceiptGate}
              className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold border transition active:scale-95 disabled:opacity-50 ${
                receiptGateOn
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}>
              {togglingReceiptGate ? '…' : receiptGateOn ? <><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1" />ON</> : <><span className="inline-block w-2 h-2 rounded-full bg-slate-400 mr-1" />OFF</>}
            </button>
          </div>

          {/* Driver / Rider toggle */}
          <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1">
            {(['driver', 'rider'] as const).map(r => (
              <button key={r} onClick={() => setReceiptRoleFilter(r)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${
                  receiptRoleFilter === r ? 'bg-primary text-white' : 'text-slate-400'
                }`}>
                {r === 'driver' ? 'Drivers' : 'Riders'}
              </button>
            ))}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-2">
            {(['all', 'verified', 'expired', 'pending'] as const).map(s => {
              const count = s === 'all'
                ? driverReceipts.length
                : driverReceipts.filter(r => receiptStatus(r) === s).length;
              const styles: Record<string, string> = {
                all:      'bg-white border-slate-100 text-slate-700',
                verified: 'bg-emerald-50 border-emerald-100 text-emerald-700',
                expired:  'bg-red-50 border-red-100 text-red-600',
                pending:  'bg-amber-50 border-amber-100 text-amber-700',
              };
              return (
                <button key={s} onClick={() => setReceiptFilter(s)}
                  className={`rounded-2xl border p-3 flex flex-col items-center gap-1 transition active:scale-95 ${styles[s]} ${
                    receiptFilter === s ? 'ring-2 ring-offset-1 ring-primary/40' : ''
                  }`}
                >
                  <span className="text-lg font-black leading-none">{count}</span>
                  <span className="text-xs font-semibold uppercase tracking-wider capitalize">{s}</span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="bg-white border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Find {receiptRoleFilter === 'driver' ? 'Driver' : 'Rider'}
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={receiptSearch}
                onChange={e => setReceiptSearch(e.target.value)}
                placeholder="Name or Gerak ID"
                style={{ fontSize: '12px' }}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-700 focus:outline-none focus:border-primary transition placeholder:font-normal"
              />
              <button
                onClick={() => setReceiptSearch('')}
                disabled={!receiptSearch.trim()}
                className="px-3.5 bg-primary text-white font-semibold text-xs rounded-lg transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Receipt list */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <FileImage className="w-4 h-4" /> {receiptRoleFilter === 'driver' ? 'Driver' : 'Rider'} Receipts
              </h3>
              <button onClick={loadReceipts}
                className="w-7 h-7 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:text-primary transition active:scale-90">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-y-auto no-scrollbar h-[420px] flex flex-col gap-2">
            {receiptsLoading ? (
              <div className="flex justify-center py-8">
                <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
              </div>
            ) : filteredReceipts.length === 0 ? (
              <p className="text-xs text-slate-400 font-semibold text-center py-6">No {receiptRoleFilter}s found.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredReceipts.map(r => {
                  const status  = receiptStatus(r);
                  const expDate = r.fee_receipt_expiry ? new Date(r.fee_receipt_expiry) : null;
                  const expLabel = expDate?.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
                  return (
                    <div key={r.id}
                      className="border border-slate-100 rounded-2xl p-5 flex flex-col gap-2.5 cursor-pointer active:opacity-75 transition"
                      onClick={() => setSheetUser({ id: r.id, name: r.name, gerak_id: r.gerak_id, role: 'driver', campus: r.campus, email: r.email, status: r.status || 'active', phone: r.phone || '' })}
                    >

                      {/* Row 1: name + status badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-slate-800 truncate">{r.name}</p>
                          <p className="text-xs text-slate-400 font-semibold mt-0.5">{r.gerak_id} · {r.campus}</p>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full border uppercase shrink-0 flex items-center gap-1 ${RECEIPT_STATUS_STYLE[status]}`}>
                          {status === 'verified' ? <ShieldCheck className="w-2.5 h-2.5" /> : <ShieldOff className="w-2.5 h-2.5" />}
                          {status}
                        </span>
                      </div>

                      {/* Row 2: receipt details */}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-slate-50 rounded-xl px-3 py-2">
                          <p className="text-slate-400 font-semibold mb-0.5">Amount</p>
                          <p className="font-semibold text-slate-700">{r.fee_receipt_amount || '—'}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl px-3 py-2">
                          <p className="text-slate-400 font-semibold mb-0.5">Paid</p>
                          <p className="font-semibold text-slate-700">{r.fee_receipt_date || '—'}</p>
                        </div>
                        <div className={`rounded-xl px-3 py-2 ${status === 'expired' ? 'bg-red-50' : 'bg-slate-50'}`}>
                          <p className="text-slate-400 font-semibold mb-0.5">Expires</p>
                          <p className={`font-semibold ${status === 'expired' ? 'text-red-500' : 'text-slate-700'}`}>
                            {expLabel ?? '—'}
                          </p>
                        </div>
                      </div>

                      {/* Reject reason */}
                      {status === 'rejected' && r.fee_receipt_reject_reason && (
                        <p className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2 font-semibold">
                          Rejected: {r.fee_receipt_reject_reason}
                        </p>
                      )}

                      {/* View receipt link */}
                      {r.fee_receipt_url && (
                        <a href={r.fee_receipt_url} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="flex items-center justify-center gap-1.5 bg-primary/5 border border-primary/20 text-primary font-semibold text-xs py-2 rounded-xl hover:bg-primary/10 transition active:scale-95">
                          <ExternalLink className="w-3 h-3" /> View Receipt
                        </a>
                      )}

                      {/* Approve / Reject — pending receipts only */}
                      {status === 'pending' && r.fee_receipt_url && (
                        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleApproveReceipt(r)}
                            disabled={approvingReceipt === r.id || rejectingReceipt === r.id}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs py-2.5 rounded-xl transition active:scale-95 disabled:opacity-50"
                          >
                            {approvingReceipt === r.id
                              ? <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                              : <><ShieldCheck className="w-3 h-3" /> Approve</>}
                          </button>
                          <button
                            onClick={() => handleRejectReceipt(r)}
                            disabled={approvingReceipt === r.id || rejectingReceipt === r.id}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 border border-red-200 text-red-600 font-semibold text-xs py-2.5 rounded-xl transition active:scale-95 disabled:opacity-50"
                          >
                            {rejectingReceipt === r.id
                              ? <span className="w-3 h-3 rounded-full border-2 border-red-400 border-t-transparent animate-spin" />
                              : <><ShieldOff className="w-3 h-3" /> Reject</>}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {/* ── EARNINGS TAB (superadmin only) ── */}
      {activeTab === 'earnings' && user.role === 'superadmin' && (() => {
        const selectedDriver = earningsLeaderboard.find(d => d.driver_id === earningsDriverId);
        const weekEnd = addDays(earningsWeekStart, 6);
        const weekLabel = `${new Date(earningsWeekStart + 'T00:00:00').toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })} – ${new Date(weekEnd + 'T00:00:00').toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`;

        if (earningsDriverId) {
          // True mirror of DriverHome.tsx's own Earnings tab — current
          // month (browsable) + all-time — independent of whatever period
          // filter is active on the leaderboard.
          const [selY, selM] = detailMonth.split('-');
          const detailMonthLabel = new Date(Number(selY), Number(selM) - 1, 1)
            .toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
          const month = computeEarnings(earningsHistory, detailMonth);
          const allTime = computeEarnings(earningsHistory);

          return (
            <div className="flex flex-col gap-4">
              <button
                onClick={() => { setEarningsDriverId(null); setEarningsHistory([]); }}
                className="flex items-center gap-1 text-slate-500 text-xs font-semibold hover:underline active:scale-95 transition self-start"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back to leaderboard
              </button>

              <div className="bg-white border border-slate-100 rounded-3xl p-5">
                <p className="text-sm font-black text-slate-800">{selectedDriver?.name ?? 'Driver'}</p>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                  {selectedDriver?.gerak_id} · UMPSA {selectedDriver?.campus}
                </p>
              </div>

              {earningsLoading ? (
                <div className="flex items-center justify-center py-14">
                  <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-emerald-500 animate-spin" />
                </div>
              ) : (
                <div className="flex flex-col gap-4 px-0">
                  <MonthDrumPicker value={detailMonth} onChange={setDetailMonth} />
                  <EarningsCard label={detailMonthLabel} earned={month.earned} tbc={month.tbc} rows={month.rows} />
                  <EarningsCard label="All Time" earned={allTime.earned} tbc={allTime.tbc} rows={allTime.rows} />
                </div>
              )}
            </div>
          );
        }

        const driverCount = earningsLeaderboard.length;
        const totalEarnings = earningsLeaderboard.reduce((s, d) => s + d.total_earnings, 0);

        return (
          <div className="flex flex-col gap-4">
            {/* Period toggle */}
            <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1">
              {(['day', 'week', 'month', 'all'] as const).map(p => (
                <button key={p} onClick={() => setEarningsPeriod(p)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${
                    earningsPeriod === p ? 'bg-primary text-white' : 'text-slate-400'
                  }`}>
                  {p === 'day' ? 'Day' : p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'All Time'}
                </button>
              ))}
            </div>

            {/* Period-specific picker */}
            {earningsPeriod === 'day' && (
              <input
                type="date"
                value={earningsDay}
                onChange={e => setEarningsDay(e.target.value)}
                className="bg-white border border-slate-100 rounded-2xl px-4 py-3 text-sm font-normal text-slate-700 focus:outline-none focus:border-primary transition"
              />
            )}
            {earningsPeriod === 'week' && (
              <div className="flex items-center justify-between bg-white border border-slate-100 rounded-2xl px-3 py-3">
                <button onClick={() => setEarningsWeekStart(addDays(earningsWeekStart, -7))}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-primary transition active:scale-90">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <p className="text-xs font-black text-slate-700">{weekLabel}</p>
                <button onClick={() => setEarningsWeekStart(addDays(earningsWeekStart, 7))}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-primary transition active:scale-90">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            {earningsPeriod === 'month' && (
              <MonthDrumPicker value={leaderboardMonth} onChange={setLeaderboardMonth} />
            )}

            {/* Summary */}
            <div className="bg-white border border-slate-100 rounded-3xl p-5 flex gap-3">
              <div className="flex-1 bg-slate-50 rounded-2xl px-3 py-2.5 text-center">
                <p className="text-lg font-black text-slate-700">{driverCount}</p>
                <p className="text-xs font-normal text-slate-400">Drivers Earning</p>
              </div>
              <div className="flex-1 bg-emerald-50 rounded-2xl px-3 py-2.5 text-center">
                <p className="text-lg font-black text-emerald-600">RM {totalEarnings.toFixed(2)}</p>
                <p className="text-xs font-normal text-slate-400">Total Earnings</p>
              </div>
            </div>

            {/* Leaderboard */}
            <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" /> Driver Leaderboard
              </h3>

              {earningsLoading ? (
                <div className="flex items-center justify-center py-14">
                  <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-emerald-500 animate-spin" />
                </div>
              ) : driverCount === 0 ? (
                <p className="text-xs text-slate-400 font-semibold text-center py-6">No completed rides yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {earningsLeaderboard.map((d, i) => (
                    <button
                      key={d.driver_id}
                      onClick={() => handleSelectEarningsDriver(d.driver_id)}
                      className="flex items-center gap-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-2xl px-3.5 py-3 transition active:scale-[0.99] text-left"
                    >
                      <span className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs font-black text-slate-500 shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">{d.name}</p>
                        <p className="text-xs text-slate-400 font-semibold">{d.gerak_id} · UMPSA {d.campus}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black text-emerald-600">RM {d.total_earnings.toFixed(2)}</p>
                        <p className="text-xs text-slate-400 font-semibold">{d.completed_count} rides</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── CALENDAR TAB ── */}
      {activeTab === 'calendar' && (
        <div className="flex flex-col gap-4">

          {/* Current status */}
          <div className={`rounded-2xl p-5 flex items-center gap-3 ${calActiveYear ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100'}`}>
            <CalendarDays className={`w-5 h-5 shrink-0 ${calActiveYear ? 'text-emerald-500' : 'text-slate-400'}`} />
            <div>
              <p className="text-xs font-semibold text-slate-700">Active Calendar</p>
              <p className={`text-xs font-semibold ${calActiveYear ? 'text-emerald-600' : 'text-slate-400'}`}>
                {calActiveYear ? `UMPSA ${calActiveYear}` : 'No calendar uploaded yet'}
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
                    <button key={s.id} onClick={() => setCalPreviewSem(i)}
                      className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${calPreviewSem === i ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {s.short}
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
              <p>1. Download the latest UMPSA Academic Calendar PDF from the university website.</p>
              <p>2. Tap "Choose PDF to Upload" above.</p>
              <p>3. Wait for AI parsing (~10–15 seconds).</p>
              <p>4. Review the extracted events, then tap "Confirm & Activate".</p>
            </div>
          </div>
        </div>
      )}

      </>)}

    </div>

    {/* ── Driver Action Confirmation Modal ── */}
    {pendingAction && (() => {
      const { u } = pendingAction;
      const isTerminate = pendingAction.type === 'terminate';
      const isStop = pendingAction.type === 'toggle-status' && u.status === 'active';

      const isRoleToAdmin = pendingAction.type === 'toggle-role' && pendingAction.newRole === 'admin';

      const title =
        pendingAction.type === 'terminate'     ? `Terminate ${u.name}?` :
        pendingAction.type === 'toggle-status' ? (isStop ? `Suspend ${u.name}?` : `Reactivate ${u.name}?`) :
        pendingAction.type === 'toggle-cap'    ? `Update capabilities for ${u.name}?` :
        pendingAction.type === 'toggle-rider-cap' ? `Update capabilities for ${u.name}?` :
        pendingAction.type === 'toggle-role'   ? (isRoleToAdmin ? `Promote ${u.name} to Admin?` : `Change ${u.name} to Driver?`) :
        pendingAction.type === 'toggle-gate-exempt' ? (u.receipt_gate_exempt ? `Remove gate exemption for ${u.name}?` : `Exempt ${u.name} from receipt gate?`) :
        `Move ${u.name} to UMPSA ${(pendingAction as any).campus}?`;

      const desc =
        isTerminate  ? 'This will permanently remove their account. This cannot be undone.' :
        isStop       ? 'They will lose access to the app until reactivated.' :
        pendingAction.type === 'toggle-status' ? 'They will regain access to the app.' :
        pendingAction.type === 'toggle-cap'    ? 'Their service capabilities will be updated immediately.' :
        pendingAction.type === 'toggle-rider-cap' ? 'Their service capabilities will be updated immediately.' :
        pendingAction.type === 'toggle-role'   ? (isRoleToAdmin ? 'They will gain Admin panel access + full driving capabilities.' : 'They will lose Admin panel access and become a driver only.') :
        pendingAction.type === 'toggle-gate-exempt' ? (u.receipt_gate_exempt ? 'They will need a valid monthly receipt again to stay active.' : 'They will bypass the monthly receipt requirement and stay active regardless.') :
        'Their campus assignment will change immediately.';

      return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
          onClick={() => setPendingAction(null)}>
          <div className="w-full max-w-sm max-h-[calc(100dvh-3rem)] overflow-y-auto no-scrollbar bg-white rounded-t-3xl p-6 pb-10 shadow-2xl animate-slide-up"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
            <div className={`w-10 h-10 rounded-2xl mx-auto mb-3 flex items-center justify-center ${
              isTerminate ? 'bg-red-100' : isStop ? 'bg-amber-100' : 'bg-primary/10'
            }`}>
              {isTerminate
                ? <Trash2 className="w-5 h-5 text-red-500" />
                : isStop
                  ? <span className="text-amber-600 font-black text-sm">✕</span>
                  : <span className="text-primary font-black text-sm">✓</span>}
            </div>
            <h3 className="text-sm font-black text-slate-800 text-center mb-1">{title}</h3>
            <p className="text-xs text-slate-400 font-semibold text-center mb-6">{desc}</p>
            <div className="flex gap-3">
              <button onClick={() => setPendingAction(null)}
                className="flex-1 bg-slate-100 text-slate-600 font-semibold text-xs py-3 rounded-2xl transition active:scale-95">
                Cancel
              </button>
              <button onClick={executePendingAction}
                className={`flex-1 font-semibold text-xs py-3 rounded-2xl transition active:scale-95 text-white ${
                  isTerminate ? 'bg-red-500' : isStop ? 'bg-amber-500' : 'bg-primary'
                }`}>
                Yes, Confirm
              </button>
            </div>
          </div>
        </div>
      );
    })()}

    {/* ── Receipt Gate Master Confirmation Modal ── */}
    {showGateMasterConfirm && (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
        onClick={() => setShowGateMasterConfirm(false)}>
        <div className="w-full max-w-sm max-h-[calc(100dvh-3rem)] overflow-y-auto no-scrollbar bg-white rounded-t-3xl p-6 pb-10 shadow-2xl animate-slide-up"
          onClick={e => e.stopPropagation()}>
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
          <div className={`w-10 h-10 rounded-2xl mx-auto mb-3 flex items-center justify-center ${
            receiptGateOn ? 'bg-amber-100' : 'bg-primary/10'
          }`}>
            {receiptGateOn
              ? <span className="text-amber-600 font-black text-sm">✕</span>
              : <span className="text-primary font-black text-sm">✓</span>}
          </div>
          <h3 className="text-sm font-black text-slate-800 text-center mb-1">
            {receiptGateOn ? 'Turn OFF Receipt Gate?' : 'Turn ON Receipt Gate?'}
          </h3>
          <p className="text-xs text-slate-400 font-semibold text-center mb-6">
            {receiptGateOn
              ? 'Every driver and rider will bypass the monthly receipt requirement and stay active regardless of payment.'
              : 'Drivers and riders will need a valid monthly receipt again to stay active.'}
          </p>
          <div className="flex gap-3">
            <button onClick={() => setShowGateMasterConfirm(false)}
              className="flex-1 bg-slate-100 text-slate-600 font-semibold text-xs py-3 rounded-2xl transition active:scale-95">
              Cancel
            </button>
            <button onClick={() => { handleToggleReceiptGate(); setShowGateMasterConfirm(false); }}
              className={`flex-1 font-semibold text-xs py-3 rounded-2xl transition active:scale-95 text-white ${
                receiptGateOn ? 'bg-amber-500' : 'bg-primary'
              }`}>
              Yes, Confirm
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Invite Confirmation Modal ── */}
    {showInviteConfirm && (
      <div
        className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
        onClick={() => setShowInviteConfirm(false)}
      >
        <div
          className="w-full max-w-sm max-h-[calc(100dvh-3rem)] overflow-y-auto no-scrollbar bg-white rounded-t-3xl p-6 pb-10 shadow-2xl animate-slide-up"
          onClick={e => e.stopPropagation()}
        >
          {/* Handle bar */}
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />

          {/* Title */}
          <h3 className="text-sm font-black text-slate-800 text-center mb-1">Confirm {inviteRole === 'admin' ? 'Admin' : inviteRole === 'rider' ? 'Rider' : 'Driver'} Invite</h3>
          <p className="text-xs text-slate-400 font-semibold text-center mb-5">
            Please review before sending.
          </p>

          {/* Receipt-style card */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden mb-5">

            {/* Header stripe */}
            <div className={`px-4 py-3 flex items-center gap-2 ${inviteRole === 'admin' ? 'bg-violet-600' : inviteRole === 'rider' ? 'bg-emerald-600' : 'bg-primary'}`}>
              <Send className="w-3.5 h-3.5 text-white" />
              <span className="text-white font-semibold text-xs uppercase tracking-widest">{inviteRole === 'admin' ? 'Admin' : inviteRole === 'rider' ? 'Rider' : 'Driver'} Invite</span>
            </div>

            {/* Details */}
            <div className="px-4 py-4 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-normal text-slate-400">Email</p>
                <p className="text-xs font-semibold text-slate-800 text-right break-all">{inviteEmail.trim().toLowerCase()}</p>
              </div>

              <div className="h-px bg-slate-100" />

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-normal text-slate-400">Campus</p>
                <span className="text-xs font-semibold text-slate-800">UMPSA {inviteCampus}</span>
              </div>

              <div className="h-px bg-slate-100" />

              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-normal text-slate-400">Capabilities</p>
                <div className="flex flex-col items-end gap-1.5">
                  {inviteRole === 'driver' && (<>
                    <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${inviteCanDrive ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-400 line-through'}`}>
                      <Car className="w-3 h-3" /> Gerak Car {inviteCanDrive ? '✓' : '✗'}
                    </span>
                    <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${inviteCanRent ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-400 line-through'}`}>
                      <KeyRound className="w-3 h-3" /> Gerak Rental {inviteCanRent ? '✓' : '✗'}
                    </span>
                  </>)}
                  {inviteRole === 'rider' && (<>
                    <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${inviteCanDaily ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400 line-through'}`}>
                      <Bike className="w-3 h-3" /> Gerak Daily {inviteCanDaily ? '✓' : '✗'}
                    </span>
                    <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${inviteCanRobe ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-400 line-through'}`}>
                      <GraduationCap className="w-3 h-3" /> Robe Convocation {inviteCanRobe ? '✓' : '✗'}
                    </span>
                  </>)}
                  {inviteRole === 'admin' && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700">
                      <Settings className="w-3 h-3" /> Full Access
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Footer stripe */}
            <div className="bg-slate-100 px-4 py-2.5">
              <p className="text-xs text-slate-400 font-semibold text-center">
                Sent by {user.name} · {new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowInviteConfirm(false)}
              className="flex-1 bg-slate-100 text-slate-600 font-semibold text-xs py-3 rounded-2xl transition active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={() => { setShowInviteConfirm(false); handleSendInvite(); }}
              disabled={inviteSending}
              className="flex-1 bg-primary hover:bg-primary-hover text-white font-semibold text-xs py-3 rounded-2xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shadow-primary/20"
            >
              {inviteSending
                ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : <><Send className="w-3.5 h-3.5" /> Yes, Send Invite</>}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Banner Crop Modal ── */}
    {cropSrc && (
      <div className="absolute inset-0 z-[80] bg-black flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0">
          <button
            onClick={() => { setCropSrc(''); setCropObj(undefined); setCompletedCrop(undefined); }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20 transition">
            <X className="w-4 h-4" />
          </button>
          <span className="text-white font-black text-sm tracking-wide">Crop Banner</span>
          <button
            onClick={handleCropConfirm}
            disabled={!completedCrop}
            className="flex items-center gap-1.5 bg-amber-400 text-black font-black text-xs px-3 py-1.5 rounded-full active:scale-95 transition disabled:opacity-40">
            <Check className="w-3.5 h-3.5" />
            Done
          </button>
        </div>

        {/* Crop area */}
        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden min-h-0">
          <ReactCrop
            crop={cropObj}
            onChange={c => setCropObj(c)}
            onComplete={c => setCompletedCrop(c)}
            style={{ maxWidth: '100%', maxHeight: '100%' }}
          >
            <img
              ref={cropImgRef}
              src={cropSrc}
              alt="crop preview"
              onLoad={onCropImgLoad}
              style={{ maxWidth: '100%', maxHeight: 'calc(100dvh - 160px)', objectFit: 'contain', display: 'block' }}
            />
          </ReactCrop>
        </div>

        {/* Hint */}
        <div className="px-4 pb-8 text-center shrink-0">
          <span className="text-white/40 text-xs">Drag corners to adjust · Free crop, any shape</span>
        </div>
      </div>
    )}
    </>
  );
};
