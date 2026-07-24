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
// "New") — that's a deliberate audience difference, not drift, so it isn't
// part of this shared module.

export const JUBAH_STEP_LABEL: Record<string, string> = {
  ordered:    'Pending',
  paid:       'Paid',
  booked:     'New',
  processing: 'Processing',
  collected:  'Collected',
  at_hub:     'At Hub',
  delivered:  'Delivered',
  cancelled:  'Cancelled',
};

export const JUBAH_STATUS_STYLE: Record<string, string> = {
  ordered:    'bg-slate-50 border-slate-200 text-slate-500',
  paid:       'bg-emerald-50 border-emerald-100 text-emerald-700',
  booked:     'bg-blue-50 border-blue-100 text-blue-700',
  processing: 'bg-violet-50 border-violet-100 text-violet-700',
  collected:  'bg-amber-50 border-amber-100 text-amber-700',
  at_hub:     'bg-emerald-50 border-emerald-100 text-emerald-700',
  delivered:  'bg-emerald-50 border-emerald-100 text-emerald-700',
  cancelled:  'bg-red-50 border-red-100 text-red-600',
};

export const JUBAH_NEXT_LABEL: Record<string, string> = {
  processing: 'Start Processing',
  collected:  'Mark Collected',
  at_hub:     'Mark Delivered to Hub',
  delivered:  'Mark Delivered',
};

// Deposit-mode bookings reach 'booked' by paying the deposit, so that's
// their first step. Pickup/postage bookings pay in full up front and land
// on 'paid' first — they never pass through 'booked' at all.
export const getJubahSteps = (paymentMode: string): string[] =>
  paymentMode === 'deposit'
    ? ['booked', 'processing', 'collected', 'delivered']
    : paymentMode === 'postage'
    ? ['paid', 'booked', 'processing', 'collected', 'at_hub']
    : ['paid', 'booked', 'processing', 'collected', 'delivered'];

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

export const getJubahProgress = (status: string, paymentMode: string): JubahProgress => {
  const steps = getJubahSteps(paymentMode);
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
    booked:     `Assalamualaikum ${name} 🎓\n\nTempahan jubah anda telah berjaya diterima oleh Gerak Jubah! ✅\n\nKami akan maklumkan perkembangan seterusnya tidak lama lagi.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`,
    processing: `Assalamualaikum ${name} 🎓\n\nJubah anda sedang dalam proses pembersihan dan pengemasan. 🔄\n\nKami akan maklumkan apabila ia siap untuk diambil.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`,
    collected:  `Assalamualaikum ${name} 🎓\n\nJubah anda telah berjaya diambil! ✅\n\nSila hubungi kami sekiranya ada sebarang pertanyaan.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`,
    at_hub:     `Assalamualaikum ${name} 🎓\n\nJubah anda telah sampai di hab pos. 📦\n\nIa akan dihantar ke alamat anda tidak lama lagi.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`,
    on_the_way: `Assalamualaikum ${name} 🎓\n\nJubah anda sedang dalam perjalanan ke alamat anda! 🚚\n\nSila pastikan anda berada di rumah untuk menerima penghantaran.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`,
    delivered:  `Assalamualaikum ${name} 🎓\n\nJubah anda telah berjaya dihantar! 🎉\n\nTerima kasih kerana menggunakan Gerak Jubah. Semoga majlis konvokesyen anda berjalan lancar! 🎓\n\nRujukan: ${ref}`,
  };
  return msgs[status] ?? `Assalamualaikum ${name} 🎓\n\nIni Gerak Jubah. Terima kasih atas tempahan anda.\n\nRujukan: ${ref}\n\nTerima kasih 🙏`;
};
