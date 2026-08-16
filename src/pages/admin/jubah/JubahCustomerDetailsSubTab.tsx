import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, RefreshCw, Search, Users, XCircle } from 'lucide-react';
import type { SheetData } from 'write-excel-file/browser';
import { supabase } from '../../../lib/supabase';
import { useAxisLockedScroll } from '../../../hooks/useAxisLockedScroll';
import { JUBAH_STEP_LABEL as JUBAH_STATUS_LABEL } from '../../../lib/jubahStatus';
import type { JubahBookingRow } from './JubahCustomerSubTab';

type DocField = { field_key: string; label: string; position: number };

interface Props {
  active: boolean;
  bookings: JubahBookingRow[];
  bookingsTotalCount: number | null;
  bookingsLoading: boolean;
  reload: () => void;
  showToast: (message: string) => void;
  universityKey: string;
  universityLabel: string;
}

const FALLBACK_FIELDS: Record<string, DocField[]> = {
  umpsa: [
    { field_key: 'oscar', label: 'OSCAR', position: 1 },
    { field_key: 'skpg', label: 'SKPG', position: 2 },
    { field_key: 'konvo', label: 'Konvo Slip', position: 3 },
    { field_key: 'ic', label: 'IC (Front & Back)', position: 4 },
  ],
  default: [
    { field_key: 'konvo', label: 'Attendance Confirmation', position: 1 },
    { field_key: 'skpg', label: 'SKPG', position: 2 },
    { field_key: 'ic', label: 'IC (Front & Back)', position: 3 },
  ],
};

const documentPath = (booking: JubahBookingRow, key: string) => {
  if (key === 'oscar') return booking.oscar_path;
  if (key === 'skpg') return booking.skpg_path;
  if (key === 'konvo') return booking.konvo_path;
  if (key === 'ic') return booking.ic_path;
  return null;
};

const safeFilePart = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function JubahCustomerDetailsSubTab({
  active, bookings, bookingsTotalCount, bookingsLoading, reload, showToast,
  universityKey, universityLabel,
}: Props) {
  const tableScrollRef = useAxisLockedScroll<HTMLDivElement>();
  const [search, setSearch] = useState('');
  const [docFields, setDocFields] = useState<DocField[]>(FALLBACK_FIELDS[universityKey] ?? FALLBACK_FIELDS.default);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const loadFields = async () => {
      const { data, error } = await supabase.from('jubah_doc_fields')
        .select('field_key,label,position')
        .eq('university_key', universityKey)
        .order('position');
      if (cancelled) return;
      if (!error && data?.length) setDocFields(data as DocField[]);
      else setDocFields(FALLBACK_FIELDS[universityKey] ?? FALLBACK_FIELDS.default);
    };
    void loadFields();
    return () => { cancelled = true; };
  }, [active, universityKey]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return bookings;
    return bookings.filter(booking => [
      booking.reference, booking.full_name, booking.ic_number, booking.hp_number,
      booking.email ?? '', booking.matric_id, booking.faculty, booking.campus,
    ].some(value => value.toLowerCase().includes(query)));
  }, [bookings, search]);

  const bookingSequenceById = useMemo(() => {
    const offset = Math.max(0, (bookingsTotalCount ?? bookings.length) - bookings.length);
    const chronological = [...bookings].sort((a, b) => {
      const byCreated = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return byCreated || a.id.localeCompare(b.id);
    });
    return new Map(chronological.map((booking, index) => [booking.id, offset + index + 1]));
  }, [bookings, bookingsTotalCount]);

  const headers = useMemo(() => [
    'No', 'Reference', 'Full Name', 'IC Number', 'Phone', 'Email', 'Matric ID',
    'University', 'Campus', 'Faculty', 'Remark', 'Payment Mode', 'Amount (RM)',
    'Balance Due (RM)', 'Delivery Address', 'Rider', 'Status', 'Created At',
    ...docFields.map(field => field.label), 'Combined PDF', 'Payment Proof', 'Balance Proof',
  ], [docFields]);

  const detailRows = useMemo(() => filtered.map(booking => [
    String(bookingSequenceById.get(booking.id) ?? ''),
    booking.reference,
    booking.full_name,
    booking.ic_number,
    booking.hp_number,
    booking.email ?? '',
    booking.matric_id,
    booking.university,
    booking.campus,
    booking.faculty,
    booking.remark,
    booking.payment_mode,
    Number(booking.cost || 0).toFixed(2),
    Number(booking.balance_due || 0).toFixed(2),
    booking.delivery_address ?? '',
    booking.rider_name ?? '',
    JUBAH_STATUS_LABEL[booking.status] ?? booking.status,
    new Date(booking.created_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }),
    ...docFields.map(field => documentPath(booking, field.field_key) ? '✓' : '✕'),
    booking.docs_path ? '✓' : '✕',
    booking.payment_path ? '✓' : '✕',
    booking.balance_proof_url ? '✓' : '✕',
  ]), [filtered, docFields, bookingSequenceById]);

  const download = async (format: 'csv' | 'xlsx') => {
    if (!filtered.length || exporting) return;
    setExportMenuOpen(false);
    setExporting(format);
    const fileBase = `jubah-customer-details-${safeFilePart(universityLabel)}-${new Date().toISOString().slice(0, 10)}`;
    try {
      const data = detailRows;
      if (format === 'csv') {
        const safeCell = (value: string) => {
          const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
          return `"${guarded.replace(/"/g, '""')}"`;
        };
        const csv = [headers, ...data].map(row => row.map(safeCell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${fileBase}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } else {
        const { default: writeXlsxFile } = await import('write-excel-file/browser');
        const sheet: SheetData = [
          headers.map(value => ({ value, type: String, fontWeight: 'bold', backgroundColor: '#F8FAFC' })),
          ...data.map(row => row.map(value => ({ value, type: String }))),
        ];
        const workbook = writeXlsxFile(sheet, {
          columns: headers.map((header, index) => ({
            width: [2, 8, 14].includes(index) ? 30 : Math.max(10, Math.min(24, header.length + 3)),
          })),
        });
        await workbook.toFile(`${fileBase}.xlsx`);
      }
      showToast(`${format.toUpperCase()} downloaded.`);
    } catch (error) {
      console.error('Customer details export failed:', error);
      showToast(`Couldn't create the ${format.toUpperCase()} file.`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white border border-slate-100 rounded-2xl p-3.5 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search customer details…"
            style={{ fontSize: '12px' }}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 font-semibold text-slate-700 focus:outline-none focus:border-slate-900 placeholder:font-normal placeholder:text-slate-300"
          />
        </div>
        <button type="button" onPointerDown={event => { event.preventDefault(); setSearch(''); }} disabled={!search}
          className="px-3.5 bg-primary text-white text-xs font-semibold rounded-lg active:scale-95 transition-transform transform-gpu disabled:opacity-40">
          Clear
        </button>
        <button type="button" onPointerDown={event => { event.preventDefault(); reload(); }} aria-label="Refresh customer details"
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-slate-100 text-slate-400 active:scale-90 transition-transform transform-gpu">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
        <div className="relative flex items-center justify-between gap-3">
          <h3 className="min-w-0 text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-slate-400 shrink-0" /> Customer Details ({universityLabel})
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-normal text-slate-300">{filtered.length} customers</span>
            <button type="button" data-axis-lock-ignore disabled={!filtered.length || exporting !== null}
              onPointerDown={event => { event.preventDefault(); event.stopPropagation(); setExportMenuOpen(open => !open); }}
              aria-label="Download customer details"
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-slate-500 active:bg-slate-50 active:scale-95 transition-transform transform-gpu disabled:opacity-40">
              {exporting ? <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" /> : <Download className="w-4 h-4" />}
            </button>
          </div>
          {exportMenuOpen && <>
            <div className="fixed inset-0 z-40" onPointerDown={event => { event.preventDefault(); setExportMenuOpen(false); }} />
            <div className="absolute right-0 top-10 z-50 min-w-[180px] overflow-hidden bg-white border border-slate-100 rounded-2xl shadow-xl">
              <button type="button" onPointerDown={event => { event.preventDefault(); void download('csv'); }}
                className="w-full px-4 py-3 text-left text-xs font-semibold text-slate-700 active:bg-slate-50">Download CSV</button>
              <button type="button" onPointerDown={event => { event.preventDefault(); void download('xlsx'); }}
                className="w-full px-4 py-3 text-left text-xs font-semibold text-slate-700 border-t border-slate-100 active:bg-slate-50">Download Excel (.xlsx)</button>
            </div>
          </>}
        </div>

        {bookingsTotalCount !== null && bookingsTotalCount > bookings.length && (
          <p className="text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            Showing the latest {bookings.length} of {bookingsTotalCount} customers.
          </p>
        )}

        {bookingsLoading ? (
          <div className="flex justify-center py-8"><span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">No customer details found.</p>
        ) : (
          <div ref={tableScrollRef} className="table-scroll-x relative w-full max-w-full overflow-x-auto overscroll-none" style={{ contain: 'layout paint' }}>
            <div data-axis-y className="max-h-[600px] overflow-y-auto overscroll-none no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="min-w-max border-collapse text-left">
                <thead><tr className="border-b border-slate-100">
                  {headers.map(header => <th key={header} className="sticky top-0 bg-white py-2 pr-5 whitespace-nowrap text-xs font-semibold text-slate-400">{header}</th>)}
                </tr></thead>
                <tbody>{filtered.map((booking, rowIndex) => {
                  const values = detailRows[rowIndex];
                  return <tr key={booking.id} className="border-b border-slate-100 text-xs">
                    {values.map((value, index) => {
                      const documentStart = headers.length - docFields.length - 3;
                      const isDocument = index >= documentStart;
                      return <td key={`${booking.id}-${headers[index]}`} className="py-2.5 pr-5 whitespace-nowrap font-normal text-slate-600">
                        {isDocument
                          ? value === '✓' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-500" />
                          : <span className={index === 1 ? 'font-mono font-semibold text-primary' : index === 2 ? 'font-semibold text-slate-800' : ''}>{value || '—'}</span>}
                      </td>;
                    })}
                  </tr>;
                })}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
