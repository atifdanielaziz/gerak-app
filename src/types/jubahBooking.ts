// Single source of truth for "what a Jubah booking submission needs" — used by
// bookJubah() so its call sites pass one object instead of 25 positional
// arguments (which made a silent argument-transposition bug possible: several
// runs of consecutive same-typed params, e.g. docsPath/oscarPath/skpgPath/
// konvoPath/icPath, all typecheck in any order).

export type JubahPaymentMode = 'pickup' | 'postage' | 'deposit';
export type JubahRemark = 'Master' | 'PHD' | 'Degree' | 'Diploma';
export type JubahDepositMethod = 'pickup' | 'postage';
export type JubahPostageZone = 'SM' | 'SS';

export interface JubahBookingInput {
  reference: string;
  fullName: string;
  icNumber: string;
  hpNumber: string;
  email?: string;
  university: string;
  faculty: string;
  matricId: string;
  campus: string;
  paymentMode: JubahPaymentMode;
  remark: JubahRemark;
  combinedFileName: string;
  depositMethod?: JubahDepositMethod;
  postageZone?: JubahPostageZone;
  deliveryAddress?: string;
  riderId?: string;
  riderName?: string;
  universityKey?: string;
  customQuoteToken?: string;
  documents: {
    docs?: string;
    payment?: string;
    oscar?: string;
    skpg?: string;
    konvo?: string;
    ic?: string;
  };
}
