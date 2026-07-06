import { supabase } from './supabase';

// jubah-docs is a private bucket — stored values are either a raw storage
// path (new bookings, foldered as `{reference}/{label}.{ext}`) or, for
// bookings made before this bucket was locked down, a full public-style
// URL like `.../storage/v1/object/public/jubah-docs/{path}`. This extracts
// the path either way, then generates a fresh signed URL on demand for
// whoever is actually authorized to view it (admin/superadmin or the
// assigned rider — enforced by the bucket's RLS policies, not by this
// function itself).
export async function getJubahDocSignedUrl(stored: string | null | undefined, download = false): Promise<string | null> {
  if (!stored) return null;
  const marker = '/jubah-docs/';
  const path = stored.startsWith('http')
    ? stored.slice(stored.indexOf(marker) + marker.length)
    : stored;
  if (!path) return null;

  const { data, error } = await supabase.storage.from('jubah-docs').createSignedUrl(path, 3600, { download });
  if (error || !data) {
    console.error('[GERAK] Could not sign jubah-docs URL:', error);
    return null;
  }
  return data.signedUrl;
}
