import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = 'https://www.gerakmy.com'
function corsHeaders(req: Request) {
  const origin = req.headers.get('origin')
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

const FIELD_COLUMNS: Record<string, string> = {
  oscar: 'oscar_path',
  skpg: 'skpg_path',
  konvo: 'konvo_path',
  ic: 'ic_path',
}

// Lets a customer preview/download their own currently-uploaded OSCAR/SKPG/
// Konvo/IC before deciding to replace it — Track My Order previously had no
// view capability at all, since customers have no Storage read RLS on
// jubah-docs (only admin/superadmin/assigned-rider do). Same reference +
// last-4-IC gate as get_jubah_receipt / customer_replace_jubah_document,
// re-verified independently here.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })

  try {
    const { reference, icLast4, field, download } = await req.json().catch(() => ({}))
    if (!reference || !icLast4 || !field) return json({ success: false, error: 'Missing parameters.' }, 400)
    const column = FIELD_COLUMNS[field]
    if (!column) return json({ success: false, error: 'Invalid field.' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Same per-IP/global throttle as check_jubah_rate_limit(), replicated
    // here rather than called as an RPC — that function reads the
    // request.headers GUC that PostgREST populates on a direct RPC call,
    // which isn't set when this edge function talks to Postgres on its own.
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown'
    await admin.from('jubah_tracking_attempts').delete().lt('attempted_at', new Date(Date.now() - 60_000).toISOString())
    const { count: ipCount } = await admin.from('jubah_tracking_attempts').select('*', { count: 'exact', head: true }).eq('client_ip', ip)
    if ((ipCount ?? 0) >= 20) return json({ success: false, error: 'Too many requests right now. Please wait a minute and try again.' }, 429)
    const { count: globalCount } = await admin.from('jubah_tracking_attempts').select('*', { count: 'exact', head: true })
    if ((globalCount ?? 0) >= 500) return json({ success: false, error: 'Too many requests right now. Please wait a minute and try again.' }, 429)
    await admin.from('jubah_tracking_attempts').insert({ client_ip: ip })

    const { data: b } = await admin
      .from('jubah_bookings')
      .select(`id, ic_number, ${column}`)
      .eq('reference', reference)
      .maybeSingle<Record<string, string>>()
    if (!b) return json({ success: false, error: 'Booking not found.' }, 404)

    const last4 = (b.ic_number ?? '').replace(/\D/g, '').slice(-4)
    if (!last4 || last4 !== icLast4) return json({ success: false, error: 'Incorrect IC digits.' }, 403)

    const path = b[column]
    if (!path) return json({ success: false, error: 'This document has not been uploaded yet.' }, 404)

    const { data: signed, error } = await admin.storage.from('jubah-docs').createSignedUrl(path, 3600, { download: !!download })
    if (error || !signed) {
      console.error('jubah-doc-view: signing failed', error)
      return json({ success: false, error: 'Could not generate link.' }, 500)
    }

    return json({ success: true, url: signed.signedUrl })
  } catch (err) {
    console.error('jubah-doc-view unhandled error:', err)
    return json({ success: false, error: 'Server error.' }, 500)
  }
})
