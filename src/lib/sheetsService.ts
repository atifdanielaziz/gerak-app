// ─────────────────────────────────────────────────────────────────────────────
// After deploying your Google Apps Script web app, paste the URL below.
// Leave the placeholder if not yet deployed — submissions will be skipped silently.
// ─────────────────────────────────────────────────────────────────────────────
const SHEETS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyadRSW0NO4fdPFf4nlSHGhePFBHn5BUyIF1grngwpTcYy1PXiE6W56Ix_Rrif8I3bd/exec';

export interface JubahSheetRow {
  fullName: string;
  icNumber: string;
  hpNumber: string;
  university: string;
  faculty: string;
  matricId: string;
  paymentMode: 'pickup' | 'postage';
  remark: string;
  combinedFileName: string;
  cost: number;
  deliveryAddress?: string;
  driveDocsUrl?: string;
  drivePaymentUrl?: string;
  driveOscarUrl?: string;
  driveSkpgUrl?: string;
  driveKonvoUrl?: string;
  driveIcUrl?: string;
}

export async function submitJubahToSheets(data: JubahSheetRow): Promise<void> {
  try {
    await fetch(SHEETS_WEBAPP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'jubah', ...data }),
    });
  } catch (err) {
    console.error('[GERAK] Google Sheets sync failed:', err);
  }
}

export interface RideSheetRow {
  campus: string;
  date: string;
  time: string;
  pickup: string;
  destination: string;
  passengers: number;
  contact: string;
  fare: number | 'TBC';
  nightCharge: number;
  notes: string;
  bookMode: 'quick' | 'map';
}

export async function submitRideToSheets(data: RideSheetRow): Promise<void> {
  try {
    await fetch(SHEETS_WEBAPP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'ride', ...data }),
    });
  } catch (err) {
    console.error('[GERAK] Google Sheets sync failed:', err);
  }
}
