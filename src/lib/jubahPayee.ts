import { supabase } from './supabase';
import type { JubahBankInfo } from '../components/JubahBankDetails';

// Where a customer pays for a Jubah booking: the rider's own account if
// superadmin set them up as a direct payee (owners), otherwise the shared
// superadmin-set account + QR. See migration 20261010100000_jubah_direct_payees.
export interface JubahPaymentTarget {
  bank: JubahBankInfo;
  /** Path inside the public jubah-qr bucket. */
  qrPath: string;
  /** Rider id when paying that rider directly; null for the shared account. */
  payeeRiderId: string | null;
}

export const SHARED_QR_PATH = 'qr.jpg';
export const payeeQrPath = (riderId: string) => `payees/${riderId}.jpg`;

export async function getSharedJubahBank(): Promise<JubahBankInfo | null> {
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['jubah_bank_name', 'jubah_bank_account_number', 'jubah_bank_account_holder']);
  const name    = data?.find(r => r.key === 'jubah_bank_name')?.value;
  const account = data?.find(r => r.key === 'jubah_bank_account_number')?.value;
  const holder  = data?.find(r => r.key === 'jubah_bank_account_holder')?.value;
  return name && account && holder ? { name, account, holder } : null;
}

// payeeRiderId: the rider to check (chosen rider on the form, or the
// booking's recorded payee). Falls back to the shared account.
export async function getJubahPaymentTarget(payeeRiderId: string | null | undefined): Promise<JubahPaymentTarget | null> {
  if (payeeRiderId) {
    const { data } = await supabase.rpc('get_jubah_payee', { p_rider_id: payeeRiderId });
    const row = (data as { rider_id: string; bank_name: string; account_number: string; account_holder: string }[] | null)?.[0];
    if (row) {
      return {
        bank: { name: row.bank_name, account: row.account_number, holder: row.account_holder },
        qrPath: payeeQrPath(row.rider_id),
        payeeRiderId: row.rider_id,
      };
    }
  }
  const shared = await getSharedJubahBank();
  return shared ? { bank: shared, qrPath: SHARED_QR_PATH, payeeRiderId: null } : null;
}
