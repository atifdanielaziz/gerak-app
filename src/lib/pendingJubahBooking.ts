// Tracks a Jubah booking whose confirmation was not completed in this
// browser (back button, closed tab, or interrupted flow). Stores only the reference +
// hp_number needed to look the booking up again — never the full booking —
// so a stale marker can't make an unpaid order look "confirmed" anywhere.
const KEY = 'gerak_jubah_pending_ref';

export interface PendingJubahBooking {
  reference: string;
  hpNumber: string;
  savedAt: string;
}

export const savePendingJubahBooking = (reference: string, hpNumber: string) => {
  try {
    const entry: PendingJubahBooking = { reference, hpNumber, savedAt: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(entry));
  } catch { /* private browsing / storage disabled — non-fatal */ }
};

export const getPendingJubahBooking = (): PendingJubahBooking | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.reference || !parsed?.hpNumber) return null;
    return parsed as PendingJubahBooking;
  } catch {
    return null;
  }
};

export const clearPendingJubahBooking = () => {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
};
