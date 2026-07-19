import { fmt12, fmtDuration } from './format';

// ── Shared shapes ────────────────────────────────────────────────────────────

export interface ReceiptRow {
  label: string;
  value: string;
  emphasis?: 'highlight' | 'total';        // highlight = blue-600 bold (date/time); total = larger, paired with dividerBefore in the PDF spec
  whatsapp?: { phone: string; message?: string };
  copyable?: boolean;                       // renders a Copy icon next to the value, in-app card only — receiptPdf.ts never reads this
  dividerBefore?: boolean;                  // dashed section-break drawn above this row
}

export interface ReceiptMeta {
  statusLabel: string;
  statusClassName: string;
  createdAt: string | null;   // raw ISO/DB timestamp — formatting happens at render time; null when unavailable (e.g. Jubah's client-only booking state has no timestamp)
  bookingRef: string;
  subtitle: string;    // PDF subtitle, e.g. 'Gerak Car — Trip Receipt'
}

export interface ReceiptDoc extends ReceiptMeta {
  rows: ReceiptRow[];
}

// ── Transport (Gerak Car / ride_orders) ──────────────────────────────────────

export interface TransportReceiptSource {
  id: string;
  date: string;
  time: string;
  campus: string;
  pickup: string;
  destination: string;
  passengers: number;
  contact: string;
  fare: string;
  night_charge: number;
  notes: string;
  status: string;
  created_at: string;
  driver_name?: string | null;
  driver_contact?: string | null;
  driver_gerak_id?: string | null;
}

const TRANSPORT_STATUS_STYLE: Record<string, string> = {
  pending:     'bg-amber-50 text-amber-600 border-amber-200',
  accepted:    'bg-emerald-50 text-emerald-600 border-emerald-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-300',
  completed:   'bg-slate-100 text-slate-500 border-slate-200',
  cancelled:   'bg-red-50 text-red-400 border-red-200',
};

const TRANSPORT_STATUS_LABEL: Record<string, string> = {
  pending:     'Pending',
  accepted:    'Driver Assigned',
  in_progress: 'In Progress',
  completed:   'Completed',
  cancelled:   'Cancelled',
};

const fareLabel = (o: TransportReceiptSource) =>
  o.fare === 'TBC' ? 'TBC' : `RM${(Number(o.fare) + (o.night_charge ?? 0)).toFixed(2)}`;

export function buildTransportReceiptRows(
  o: TransportReceiptSource,
  opts?: { showContactWhatsApp?: boolean },
): ReceiptDoc {
  const rows: ReceiptRow[] = [
    { label: 'Date', value: o.date, emphasis: 'highlight' },
    { label: 'Time', value: o.time + (o.night_charge > 0 ? ' (Night +RM5)' : ''), emphasis: 'highlight' },
    { label: 'Campus', value: `UMPSA ${o.campus}` },
    { label: 'Pick-up', value: o.pickup },
    { label: 'Destination', value: o.destination },
    { label: 'Passengers', value: `${o.passengers} pax` },
    { label: 'Contact', value: o.contact, whatsapp: opts?.showContactWhatsApp ? { phone: o.contact } : undefined },
  ];
  if (o.notes) rows.push({ label: 'Remark', value: o.notes });
  rows.push({ label: 'Price', value: fareLabel(o), emphasis: 'total', dividerBefore: true });
  if (o.driver_name) {
    rows.push({
      label: 'Driver',
      value: o.driver_gerak_id ? `${o.driver_name} (${o.driver_gerak_id})` : o.driver_name,
      dividerBefore: true,
    });
    if (o.driver_contact) rows.push({ label: 'Driver Phone', value: o.driver_contact });
  }

  return {
    rows,
    statusLabel:     TRANSPORT_STATUS_LABEL[o.status] ?? o.status,
    statusClassName: TRANSPORT_STATUS_STYLE[o.status] ?? TRANSPORT_STATUS_STYLE.cancelled,
    createdAt:        o.created_at,
    bookingRef:       `#${o.id.slice(0, 8).toUpperCase()}`,
    subtitle:         'Gerak Car — Trip Receipt',
  };
}

// ── Gerak Rental (rental_bookings) ───────────────────────────────────────────

export interface RentalReceiptSource {
  id: string;
  booking_no: number;
  car_type: string;
  plate_no: string;
  color: string;
  date: string;
  end_date: string | null;
  booking_type: string;
  start_hour: number;
  duration: number;
  persons: number;
  price_hour: number;
  total_price: number;
  notes: string;
  status: string;
  owner_name: string;
  owner_gerak_id: string;
  owner_phone: string;
  created_at: string;
  renterName: string;
  renterPhone: string;
}

const RENTAL_STATUS_STYLE: Record<string, string> = {
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-500 border-red-200',
  completed: 'bg-slate-100 text-slate-500 border-slate-100',
};

const RENTAL_STATUS_LABEL: Record<string, string> = {
  pending:   'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

const rentalDateRange = (date: string, endDate: string | null, isFullDay: boolean): string => {
  if (isFullDay && endDate && endDate !== date) {
    const s = new Date(date + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short' });
    const e = new Date(endDate + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${s} – ${e}`;
  }
  return new Date(date + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
};

const rentalDayCount = (start: string, end: string): number =>
  Math.round((new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 86400000) + 1;

export function buildRentalReceiptRows(bk: RentalReceiptSource): ReceiptDoc {
  const isFullDay = bk.booking_type === 'fullday';
  const days = isFullDay && bk.end_date ? rentalDayCount(bk.date, bk.end_date) : null;

  const rows: ReceiptRow[] = [
    { label: 'Vehicle', value: bk.car_type },
    { label: 'Plate No.', value: bk.plate_no },
    { label: 'Colour', value: bk.color },
    { label: isFullDay ? 'Date Range' : 'Date', value: rentalDateRange(bk.date, bk.end_date, isFullDay), dividerBefore: true },
  ];
  if (!isFullDay) rows.push({ label: 'Time', value: `${fmt12(bk.start_hour)} → ${fmt12(bk.start_hour + bk.duration)}` });
  rows.push({ label: 'Duration', value: isFullDay ? `${days} day${days === 1 ? '' : 's'}` : fmtDuration(bk.duration) });
  rows.push({ label: 'Persons', value: `${bk.persons} pax` });
  rows.push({
    label: 'Rate',
    value: isFullDay ? `RM${Number(bk.total_price).toFixed(2)} / ${days} day${days === 1 ? '' : 's'}` : `RM${bk.price_hour.toFixed(2)} / hour`,
    dividerBefore: true,
  });
  if (bk.notes) rows.push({ label: 'Note', value: `"${bk.notes}"` });
  rows.push({ label: 'Total', value: `RM${Number(bk.total_price).toFixed(2)}`, emphasis: 'total' });
  rows.push({ label: 'Renter', value: bk.renterName || '—', dividerBefore: true });
  rows.push({ label: 'Phone', value: bk.renterPhone || '—' });
  rows.push({
    label: 'Vehicle Owner',
    value: bk.owner_name,
    whatsapp: bk.owner_phone ? { phone: bk.owner_phone } : undefined,
    dividerBefore: true,
  });
  rows.push({ label: 'Owner Phone', value: bk.owner_phone || '—' });
  rows.push({ label: 'Owner ID', value: bk.owner_gerak_id || '—' });

  return {
    rows,
    statusLabel:     RENTAL_STATUS_LABEL[bk.status] ?? bk.status,
    statusClassName: RENTAL_STATUS_STYLE[bk.status] ?? RENTAL_STATUS_STYLE.pending,
    createdAt:        bk.created_at,
    bookingRef:       `#${String(bk.booking_no ?? '').padStart(5, '0')}`,
    subtitle:         'Gerak Rental — Booking Receipt',
  };
}

// ── Jubah Delivery (jubah_bookings) ──────────────────────────────────────────

export interface JubahReceiptSource {
  reference: string;
  fullName: string;
  icNumber: string;
  hpNumber: string;
  university: string;
  faculty: string;
  matricId: string;
  remark: string; // robe type
  paymentMode: 'pickup' | 'postage' | 'deposit';
  cost: number;
  balanceDue?: number;
  balancePaid?: boolean;
  balancePaidAt?: string | null;
  deliveryAddress?: string | null;
  documentName?: string;
  status: string;
  riderName?: string | null;
  riderPhone?: string | null;
  createdAt: string | null;
}

const JUBAH_STATUS_STYLE: Record<string, string> = {
  booked:      'bg-amber-50 text-amber-600 border-amber-200',
  processing:  'bg-amber-50 text-amber-600 border-amber-200',
  collected:   'bg-blue-50 text-blue-700 border-blue-300',
  at_hub:      'bg-blue-50 text-blue-700 border-blue-300',
  picked_up:   'bg-blue-50 text-blue-700 border-blue-300',
  on_the_way:  'bg-blue-50 text-blue-700 border-blue-300',
  delivered:   'bg-emerald-50 text-emerald-600 border-emerald-200',
  cancelled:   'bg-red-50 text-red-400 border-red-200',
};

const JUBAH_STATUS_LABEL: Record<string, string> = {
  booked:      'Booked',
  processing:  'Processing',
  collected:   'Collected',
  at_hub:      'Out for Delivery',
  picked_up:   'Picked Up',
  on_the_way:  'On the Way',
  delivered:   'Delivered',
  cancelled:   'Cancelled',
};

const formatIc = (ic: string) => ic.replace(/\D/g, '').replace(/(\d{6})(\d{2})(\d{4})/, '$1-$2-$3');

const fmtJubahDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

export function buildJubahReceiptRows(j: JubahReceiptSource): ReceiptDoc {
  const paymentLabel =
    j.paymentMode === 'deposit' ? 'Deposit' :
    j.paymentMode === 'postage' ? 'Full Payment — Postage' :
                                   'Full Payment — Self Pickup';

  const rows: ReceiptRow[] = [
    { label: 'Reference Number', value: j.reference, emphasis: 'highlight', copyable: true },
    { label: 'Full Name', value: j.fullName },
    { label: 'IC Number', value: formatIc(j.icNumber) },
    { label: 'Phone', value: j.hpNumber },
    { label: 'University', value: j.university },
    { label: 'Faculty', value: j.faculty },
    { label: 'Matric ID', value: j.matricId },
    { label: 'Robe Type', value: j.remark, dividerBefore: true },
    { label: 'Booking Type', value: j.paymentMode === 'pickup' ? 'Self Pickup' : 'Postage / Delivery' },
    { label: 'Payment Mode', value: paymentLabel, dividerBefore: true },
  ];

  if (j.deliveryAddress) rows.push({ label: 'Delivery Address', value: j.deliveryAddress });

  if (j.paymentMode === 'deposit') {
    const depositDate = fmtJubahDate(j.createdAt);
    rows.push({
      label: 'Deposit Paid',
      value: depositDate ? `RM${j.cost.toFixed(2)} (${depositDate})` : `RM${j.cost.toFixed(2)}`,
    });
    if ((j.balanceDue ?? 0) > 0) {
      const balanceDate = j.balancePaid ? fmtJubahDate(j.balancePaidAt) : null;
      rows.push({
        label: j.balancePaid ? 'Balance Paid' : 'Balance Due',
        value: balanceDate ? `RM${(j.balanceDue ?? 0).toFixed(2)} (${balanceDate})` : `RM${(j.balanceDue ?? 0).toFixed(2)}`,
      });
      if (!j.balancePaid) rows.push({ label: 'Balance Due Date', value: '1 day before collection' });
    }
  } else {
    rows.push({ label: 'Amount Paid', value: `RM${j.cost.toFixed(2)}` });
  }
  const totalCharged = j.paymentMode === 'deposit' && j.balancePaid ? j.cost + (j.balanceDue ?? 0) : j.cost;
  rows.push({ label: 'Total Charged', value: `RM${totalCharged.toFixed(2)}`, emphasis: 'total' });
  if (j.documentName) rows.push({ label: 'Document', value: j.documentName, dividerBefore: true });

  if (j.riderName) {
    rows.push({ label: 'Rider Assigned', value: j.riderName, dividerBefore: true });
    if (j.riderPhone) rows.push({ label: 'Rider Contact', value: j.riderPhone });
  }

  return {
    rows,
    statusLabel:     JUBAH_STATUS_LABEL[j.status] ?? j.status,
    statusClassName: JUBAH_STATUS_STYLE[j.status] ?? JUBAH_STATUS_STYLE.booked,
    createdAt:        j.createdAt,
    bookingRef:       j.reference,
    subtitle:         'Jubah Delivery — Order Receipt',
  };
}
