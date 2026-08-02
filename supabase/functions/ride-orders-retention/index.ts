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

const RETENTION_DAYS = 30

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

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // Only terminal-state orders qualify — a pending/accepted/in_progress
    // order should never realistically be a month old (rides are same-day),
    // but if one somehow is, it's left alone rather than silently deleted
    // out from under an active booking.
    const { error, count } = await admin
      .from('ride_orders')
      .delete({ count: 'exact' })
      .in('status', ['completed', 'cancelled'])
      .lt('created_at', cutoff)

    if (error) {
      console.error('ride-orders-retention: delete error:', error)
      return json({ success: false, reason: error.message }, 500)
    }

    return json({ success: true, deleted: count ?? 0 })

  } catch (err) {
    console.error('ride-orders-retention unhandled error:', err)
    return json({ success: false, reason: 'Server error.' }, 500)
  }
})
