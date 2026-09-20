// Canonical Jubah status pipeline — shared by AdminHome (operator view),
// RiderHome (rider view), and TrackJubah (customer stepper captions).
// Previously each of those three files kept its own copy of this exact
// logic, and it drifted out of sync three separate times: the step arrays
// were missing the 'paid' status (non-deposit bookings start there, not at
// 'booked'), and the isDone/notStarted derivation collapsed "not started"
// and "finished" into the same case. Fixing it in one place instead of
// three makes that class of bug impossible going forward.
//
// TrackJubah's own top-level status badge intentionally keeps separate,
// longer customer-facing wording/colors (e.g. "Order Received" instead of
// "Confirmed") — that's a deliberate audience difference, not drift, so it
// isn't part of this shared module.

export const JUBAH_STEP_LABEL: Record<string, string> = {
  ordered:    'Pending',
  paid:       'Paid',
  processing: 'Processing',
  collected:  'Collected',
  // `at_hub` is retained as the legacy postage terminal value in the
  // database, but stage 4 is presented consistently as Delivered.
  at_hub:     'Delivered',
  delivered:  'Delivered',
  cancelled:  'Cancelled',
};

export const JUBAH_STATUS_STYLE: Record<string, string> = {
  ordered:    'bg-slate-50 border-slate-200 text-slate-500',
  paid:       'bg-emerald-50 border-emerald-100 text-emerald-700',
  processing: 'bg-violet-50 border-violet-100 text-violet-700',
  collected:  'bg-amber-50 border-amber-100 text-amber-700',
  at_hub:     'bg-emerald-50 border-emerald-100 text-emerald-700',
  delivered:  'bg-emerald-50 border-emerald-100 text-emerald-700',
  cancelled:  'bg-red-50 border-red-100 text-red-600',
};

export const JUBAH_NEXT_LABEL: Record<string, string> = {
  processing: 'Start Processing',
  collected:  'Mark Collected',
  at_hub:     'Mark Delivered',
  delivered:  'Mark Delivered',
};

// All three payment modes share the same shape: 'paid' (payment/deposit
// received) -> processing -> collected -> final step. The separate
// 'booked'/"Confirmed" checkpoint between 'paid' and 'processing' was
// removed — it never represented anything a customer/rider could act on
// differently than 'paid' already did, just an extra tap for admins/riders
// to advance through. Deposit mode now lands on 'paid' the moment the
// deposit clears too, matching the other two modes (previously it skipped
// straight from 'ordered' to 'booked', bypassing 'paid' entirely).
// 'at_hub' was postage's terminal status name here, but the backend
// (update_jubah_booking_status) only ever computes/accepts 'delivered' for
// every payment mode — the mismatch made every postage "Mark Delivered"
// call fail with "Invalid status transition." 'at_hub' is kept everywhere
// else (labels/styles/filters) purely to display bookings already stamped
// with that legacy value; new transitions must never produce it again.
const JUBAH_STEPS = ['paid', 'processing', 'collected', 'delivered'];

export type JubahProgress = {
  steps: string[];
  curStep: number;
  /** status isn't in this payment mode's steps at all — payment not confirmed yet. */
  notStarted: boolean;
  /** reached the last step. Deliberately distinct from notStarted — curStep === -1
   * must never be treated as "done", which is the exact bug this replaced. */
  isDone: boolean;
  nextStatus: string | null;
};

// paymentMode no longer branches the step sequence (both flows now share
// one, see JUBAH_STEPS above) but stays in the signature — every call site
// already has it on hand from the same booking row, and it keeps this
// function's shape stable for the callers that also destructure it locally.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for callers' shape, see comment above
export const getJubahProgress = (status: string, _paymentMode: string): JubahProgress => {
  const steps = JUBAH_STEPS;
  const curStep = steps.indexOf(status);
  return {
    steps,
    curStep,
    notStarted: curStep === -1,
    isDone: curStep >= 0 && curStep === steps.length - 1,
    nextStatus: curStep >= 0 && curStep < steps.length - 1 ? steps[curStep + 1] : null,
  };
};

export const jubahWaMsg = (
  name: string, status: string, ref: string, payMode: string,
  initialPaid: boolean, balPaid: boolean, balDue: number
): string => {
  // initialPaid must be checked too — the raw !balPaid check on its own is
  // also true before the deposit's even been paid, which would send this
  // "your balance is unpaid" reminder to a customer who hasn't paid
  // anything at all yet.
  if (payMode === 'deposit' && initialPaid && !balPaid) {
    return `Assalamualaikum ${name} 🎓\n\nIni peringatan daripada Gerak Jubah.\n\nBaki bayaran anda sebanyak *RM${balDue.toFixed(2)}* masih belum dijelaskan.\n\nSila kemaskini bukti pembayaran melalui akaun Gerak anda sebelum tarikh pengambilan jubah.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`;
  }
  const msgs: Record<string, string> = {
    paid:       `Assalamualaikum ${name} 🎓\n\nPembayaran anda telah berjaya diterima oleh Gerak Jubah! ✅\n\nKami akan maklumkan perkembangan seterusnya tidak lama lagi.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`,
    processing: `Assalamualaikum ${name} 🎓\n\nJubah anda sedang dalam proses pembersihan dan pengemasan. 🔄\n\nKami akan maklumkan apabila ia siap untuk diambil.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`,
    collected:  `Assalamualaikum ${name} 🎓\n\nJubah anda telah berjaya diambil! ✅\n\nSila hubungi kami sekiranya ada sebarang pertanyaan.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`,
    at_hub:     `Assalamualaikum ${name} 🎓\n\nJubah anda telah berjaya dihantar! 🎉\n\nTerima kasih kerana menggunakan Gerak Jubah. Semoga majlis konvokesyen anda berjalan lancar! 🎓\n\nRujukan: ${ref}`,
    on_the_way: `Assalamualaikum ${name} 🎓\n\nJubah anda sedang dalam perjalanan ke alamat anda! 🚚\n\nSila pastikan anda berada di rumah untuk menerima penghantaran.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`,
    delivered:  `Assalamualaikum ${name} 🎓\n\nJubah anda telah berjaya dihantar! 🎉\n\nTerima kasih kerana menggunakan Gerak Jubah. Semoga majlis konvokesyen anda berjalan lancar! 🎓\n\nRujukan: ${ref}`,
  };
  return msgs[status] ?? `Assalamualaikum ${name} 🎓\n\nIni Gerak Jubah. Terima kasih atas tempahan anda.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`;
};
