import { supabase } from './supabase';

export interface SignedUrlResult {
  url: string | null;
  error: string | null;
  // True when the underlying object is actually gone (Storage's "not
  // found" style error) rather than some transient/network failure — lets
  // callers show "This file no longer exists" instead of "please try
  // again" on something retrying can never fix.
  notFound: boolean;
}

// Bucket-agnostic core used by every "fetch a fresh Storage signed URL,
// then open it" call site in the app. Stored signed URLs (saved once at
// upload time) expire and, once they do, are permanently dead links — so
// every viewer regenerates one on demand from the stable storage path
// instead of trusting a saved URL.
//
// Callers previously did `const signed = await createSignedUrl(...)`
// with no try/catch around it. supabase-js's createSignedUrl REJECTS
// (throws) on a network-level failure (fetch error, CORS, timeout) rather
// than returning it in `error` the way an API-level failure does — so a
// blank `_blank` tab opened right before the call would silently stay
// blank forever, with the calling code's own "close the tab on failure"
// branch never reached. Wrapping the whole thing here so this function
// itself can never throw — every caller's failure branch now actually
// runs, and the real reason (whatever it was) is always returned to log
// or show, instead of vanishing into an unhandled promise rejection.
export async function getSignedUrl(bucket: string, path: string | null | undefined, expiresIn = 3600, download = false): Promise<SignedUrlResult> {
  if (!path) return { url: null, error: 'Invalid document path.', notFound: false };

  try {
    // A request that's neither erroring nor resolving (blocked by a browser
    // extension, VPN, or a network stack that drops it silently instead of
    // refusing it) would otherwise hang this await forever — the exact
    // "blank tab stays blank, nothing ever happens" symptom this is guarding
    // against. Race it against a timeout so it always settles one way or another.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out — check your internet connection or a browser extension blocking supabase.co.')), 10000)
    );
    const { data, error } = await Promise.race([
      supabase.storage.from(bucket).createSignedUrl(path, expiresIn, { download }),
      timeout,
    ]);
    if (error || !data) {
      console.error(`[GERAK] Could not sign ${bucket} URL:`, error);
      // Storage returns a "not found" style error (statusCode '404', a
      // message like "Object not found") when the file was actually
      // deleted — distinct from a permission/network hiccup.
      const notFound = !!error && (
        (error as { statusCode?: string }).statusCode === '404' ||
        /not.?found/i.test(error.message ?? '')
      );
      return { url: null, error: notFound ? 'This file no longer exists.' : (error?.message ?? 'Signing failed.'), notFound };
    }
    return { url: data.signedUrl, error: null, notFound: false };
  } catch (err) {
    console.error(`[GERAK] ${bucket} signing threw:`, err);
    return { url: null, error: err instanceof Error ? err.message : 'Network error while signing.', notFound: false };
  }
}

// jubah-docs is a private bucket — stored values are either a raw storage
// path (new bookings, foldered as `{reference}/{label}.{ext}`) or, for
// bookings made before this bucket was locked down, a full public-style
// URL like `.../storage/v1/object/public/jubah-docs/{path}`. This extracts
// the path either way, then generates a fresh signed URL on demand for
// whoever is actually authorized to view it (admin/superadmin or the
// assigned rider — enforced by the bucket's RLS policies, not by this
// function itself).
export async function getJubahDocSignedUrl(stored: string | null | undefined, download = false): Promise<{ url: string | null; error: string | null }> {
  if (!stored) return { url: null, error: null };
  const marker = '/jubah-docs/';
  const path = stored.startsWith('http')
    ? stored.slice(stored.indexOf(marker) + marker.length)
    : stored;
  if (!path) return { url: null, error: 'Invalid document path.' };

  const { url, error } = await getSignedUrl('jubah-docs', path, 3600, download);
  return { url, error };
}

// Opens a URL in a new tab via a synthetic <a> click instead of
// window.open(). Callers here always resolve the URL asynchronously first
// (it comes from the signing call above), so the "open a blank tab, then
// navigate it once the URL is ready" dance was needed to keep window.open()
// inside the click's user-gesture window — but some browsers/extensions
// block window.open() even when called synchronously from a real click
// (confirmed live: "Popup blocked" firing on a direct, unmodified click).
// A real <a> element's own .click() triggers normal browser navigation,
// which isn't gated by the popup blocker the way window.open() is — so
// this works even after the async signing call has already finished,
// with no blank placeholder tab needed at all.
export type JubahDocField = 'oscar' | 'skpg' | 'konvo' | 'ic';

// Combined PDF is viewable but never a replace target (it's generated from
// the four fields above, not uploaded directly) — a separate, wider type
// for the view-only path rather than loosening JubahDocField itself, so a
// stray 'combined' can't typecheck its way into a replace call.
export type JubahDocViewField = JubahDocField | 'combined';

export interface ReplaceResult {
  success: boolean;
  error: string | null;
}

// Uploads a replacement file for one Jubah document slot. Reuses the exact
// foldering convention the original booking upload uses (`{reference}/...`,
// upsert:false so the old object is left in place, just unlinked once the
// DB row is repointed) — this bucket's INSERT policy is already open to
// anon+authenticated for that same reason, so no new storage policy is
// needed for replace either.
export async function uploadJubahDocReplacement(reference: string, field: JubahDocField, file: File): Promise<{ path: string | null; error: string | null }> {
  const ext = file.name.split('.').pop() ?? 'pdf';
  const path = `${reference}/replace_${field}_${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage
    .from('jubah-docs')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error || !data) {
    console.error('[GERAK] Jubah doc replace upload failed:', error);
    return { path: null, error: error?.message ?? 'Upload failed.' };
  }
  return { path: data.path, error: null };
}

// Customer self-service path — same reference + last-4-IC gate as
// get_jubah_receipt, re-verified server-side inside the RPC itself.
export async function customerReplaceJubahDocument(reference: string, icLast4: string, field: JubahDocField, newPath: string): Promise<ReplaceResult> {
  const { data, error } = await supabase.rpc('customer_replace_jubah_document', {
    p_reference: reference,
    p_ic_last4: icLast4,
    p_document_field: field,
    p_new_path: newPath,
  });
  if (error) {
    console.error('[GERAK] customer_replace_jubah_document failed:', error);
    return { success: false, error: error.message };
  }
  return { success: !!data?.success, error: data?.success ? null : (data?.error ?? 'Replace failed.') };
}

// Rider (own assigned booking) / superadmin (any booking) path.
export async function staffReplaceJubahDocument(bookingId: string, field: JubahDocField, newPath: string): Promise<ReplaceResult> {
  const { data, error } = await supabase.rpc('staff_replace_jubah_document', {
    p_booking_id: bookingId,
    p_document_field: field,
    p_new_path: newPath,
  });
  if (error) {
    console.error('[GERAK] staff_replace_jubah_document failed:', error);
    return { success: false, error: error.message };
  }
  return { success: !!data?.success, error: data?.success ? null : (data?.error ?? 'Replace failed.') };
}

export interface CombineResult {
  success: boolean;
  path?: string;
  error: string | null;
}

// Re-merges a booking's current OSCAR/SKPG/Konvo/IC into a fresh Combined
// PDF, server-side (jubah-doc-combine edge function) — the Combined PDF is
// otherwise only ever built once, client-side, at original booking
// submission (Jubah.tsx's generateCombinedBlob), so without this it goes
// stale the moment one of the four source docs is replaced. Runs
// server-side rather than re-doing the same merge in the browser because a
// customer's browser has no Storage read access to the other three
// documents (RLS only allows admin/superadmin/assigned-rider reads).
export async function regenerateJubahCombinedPdf(
  params: { bookingId: string } | { reference: string; icLast4: string }
): Promise<CombineResult> {
  const { data, error } = await supabase.functions.invoke('jubah-doc-combine', { body: params });
  if (error) {
    console.error('[GERAK] jubah-doc-combine failed:', error);
    return { success: false, error: error.message };
  }
  return {
    success: !!data?.success,
    path: data?.path,
    error: data?.success ? null : (data?.error ?? 'Combined PDF update failed.'),
  };
}

// Customer-only document view/download — customers have no Storage read
// RLS on jubah-docs (only admin/superadmin/assigned-rider do), so this goes
// through the jubah-doc-view edge function instead, which re-verifies the
// same reference + last-4-IC gate as get_jubah_receipt server-side before
// signing a URL with the service role.
export async function getJubahCustomerDocUrl(
  reference: string, icLast4: string, field: JubahDocViewField, download = false
): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('jubah-doc-view', {
    body: { reference, icLast4, field, download },
  });
  if (error) {
    console.error('[GERAK] jubah-doc-view failed:', error);
    return { url: null, error: error.message };
  }
  if (!data?.success) return { url: null, error: data?.error ?? 'Could not open this document.' };
  return { url: data.url, error: null };
}

export function openInNewTab(url: string) {
  // This runs after the async signed-URL request. iOS Safari/PWA commonly
  // rejects a synthetic target=_blank click once the original user gesture
  // has crossed that async boundary, making View/Download appear to do
  // nothing. Try a real new browsing context first; when the browser blocks
  // it, navigate the current view instead. The latter is not popup-gated and
  // the user can return to Gerak with Back after viewing/saving the file.
  const opened = window.open(url, '_blank');
  if (opened) opened.opener = null;
  else window.location.assign(url);
}
