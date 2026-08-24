// Was duplicated verbatim between ReceiptsTab.tsx and ProfileSheet.tsx —
// same 4 columns, same derivation, kept in sync manually before this.

export interface FeeReceiptFields {
  fee_receipt_url?: string | null;
  fee_receipt_verified?: boolean | null;
  fee_receipt_expiry?: string | null;
  fee_receipt_reject_reason?: string | null;
}

export const receiptStatus = (r: FeeReceiptFields): 'verified' | 'expired' | 'rejected' | 'pending' => {
  if (!r.fee_receipt_url) return 'pending';
  if (r.fee_receipt_verified && r.fee_receipt_expiry && new Date(r.fee_receipt_expiry) <= new Date()) return 'expired';
  if (r.fee_receipt_verified) return 'verified';
  if (r.fee_receipt_reject_reason) return 'rejected';
  return 'pending';
};
