import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Locked to the real app origin instead of '*' — this one's cron/service-
// role-only anyway (see timingSafeEqual check below), so it's not reachable
// from a browser at all, but kept consistent with every other function here.
const ALLOWED_ORIGIN = 'https://www.gerakmy.com'
function corsHeaders(req: Request) {
  const origin = req.headers.get('origin')
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

const GRACE_DAYS = 7

// Plain !== short-circuits on the first differing byte, leaking a timing
// signal an attacker could in principle use to recover the service-role
// key one byte at a time. Always walks the full length instead.
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a)
  const bufB = new TextEncoder().encode(b)
  if (bufA.length !== bufB.length) return false
  let diff = 0
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i]
  return diff === 0
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })

  try {
    // Only allow calls with the service role key (from pg_cron)
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    if (!timingSafeEqual(token, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')) {
      return json({ success: false, reason: 'Unauthorized' }, 401)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // In the manual-transfer flow, an ordered booking can already have a
    // receipt awaiting review. Only rows with no proof, no recorded payment,
    // and no reconciliation flag are genuinely abandoned.
    const { data: expired, error: fetchErr } = await admin
      .from('jubah_bookings')
      .select('id, reference')
      .eq('status', 'ordered')
      .is('payment_path', null)
      .eq('initial_paid', false)
      .eq('needs_reconciliation', false)
      .lt('created_at', cutoff)

    if (fetchErr) {
      console.error('jubah-expire-unpaid: fetch error:', fetchErr)
      return json({ success: false, reason: fetchErr.message }, 500)
    }

    if (!expired || expired.length === 0) {
      return json({ success: true, cancelled: 0 })
    }

    let cancelledCount = 0

    for (const booking of expired) {
      // Claim the row first with the same eligibility guards used by the
      // fetch. If a proof or payment landed in the meantime, no row is
      // returned and its uploaded files remain untouched.
      const { data: cancelled, error: cancelErr } = await admin
        .from('jubah_bookings')
        .update({
          status:       'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: 'system',
        })
        .eq('id', booking.id)
        .eq('status', 'ordered')
        .is('payment_path', null)
        .eq('initial_paid', false)
        .eq('needs_reconciliation', false)
        .select('id')

      if (cancelErr) {
        console.error(`jubah-expire-unpaid: cancel error for ${booking.reference}:`, cancelErr)
        continue
      }
      if (!cancelled || cancelled.length === 0) continue

      // Uploads are foldered by reference (see Jubah.tsx's uploadFile), so
      // listing and removing that whole folder catches every document —
      // combined PDF, oscar/skpg/konvo/ic — regardless of which columns
      // ended up populated.
      const { data: files } = await admin.storage
        .from('jubah-docs')
        .list(booking.reference)

      if (files && files.length > 0) {
        const paths = files.map((f: { name: string }) => `${booking.reference}/${f.name}`)
        await admin.storage.from('jubah-docs').remove(paths)
      }

      cancelledCount++
    }

    return json({ success: true, cancelled: cancelledCount })

  } catch (err) {
    console.error('jubah-expire-unpaid unhandled error:', err)
    return json({ success: false, reason: 'Server error.' }, 500)
  }
})
