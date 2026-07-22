import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GRACE_DAYS = 7

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Only allow calls with the service role key (from pg_cron)
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    if (token !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      return json({ success: false, reason: 'Unauthorized' }, 401)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // Only 'ordered' — nothing paid yet — qualifies as abandoned. A
    // deposit-paid booking with an outstanding balance still has real money
    // attached to it, so that's left alone for a human to decide, same as
    // cancel_jubah_booking_admin's reasoning.
    const { data: expired, error: fetchErr } = await admin
      .from('jubah_bookings')
      .select('id, reference')
      .eq('status', 'ordered')
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

      // status='ordered' guard: narrow protection against a customer paying
      // in the exact window between the fetch above and this update.
      await admin.from('jubah_bookings').update({
        status:       'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: 'system',
      }).eq('id', booking.id).eq('status', 'ordered')

      cancelledCount++
    }

    return json({ success: true, cancelled: cancelledCount })

  } catch (err) {
    console.error('jubah-expire-unpaid unhandled error:', err)
    return json({ success: false, reason: 'Server error.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
