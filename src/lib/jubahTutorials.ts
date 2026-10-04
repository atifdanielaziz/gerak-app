import { supabase } from './supabase';

// In-app Jubah how-to videos, served from the public jubah-tutorials bucket
// (see migration 20261003150000_jubah_tutorials_bucket.sql). Object names
// are fixed so re-uploading a file replaces the video without a code change.
const BUCKET = 'jubah-tutorials';

export type JubahTutorialKey = 'book' | 'icms' | 'track' | 'balance' | 'replace';

export interface JubahTutorial {
  key: JubahTutorialKey;
  title: string;
  duration: string;
  file: string;
  /** ICMS is UMPSA's convocation portal — irrelevant to other universities. */
  umpsaOnly?: boolean;
}

// Listed in the order a customer actually goes through: book → appoint
// representative → track → pay balance → fix a document.
export const JUBAH_TUTORIALS: JubahTutorial[] = [
  { key: 'book',    title: 'How to book your Jubah',              duration: '2:31', file: 'book.mp4' },
  { key: 'icms',    title: 'Appoint your rider in ICMS (UMPSA)',  duration: '1:00', file: 'icms.mp4', umpsaOnly: true },
  { key: 'track',   title: 'How to track your order',             duration: '1:21', file: 'track.mp4' },
  { key: 'balance', title: 'How to pay your deposit balance',     duration: '1:04', file: 'balance.mp4' },
  { key: 'replace', title: 'How to replace a document',           duration: '0:57', file: 'replace.mp4' },
];

export const getJubahTutorial = (key: JubahTutorialKey): JubahTutorial =>
  JUBAH_TUTORIALS.find(t => t.key === key)!;

// Optional local override (e.g. VITE_JUBAH_TUTORIALS_BASE=/marketing/in-app/
// in .env.development.local) to preview videos before they're uploaded.
const LOCAL_BASE = import.meta.env.VITE_JUBAH_TUTORIALS_BASE as string | undefined;

export const jubahTutorialUrl = (t: JubahTutorial): string =>
  LOCAL_BASE ? `${LOCAL_BASE}${t.file}` : supabase.storage.from(BUCKET).getPublicUrl(t.file).data.publicUrl;
