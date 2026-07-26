import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Only allow calls with service role key (from pg_cron or admin)
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    if (!timingSafeEqual(token, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')) {
      return json({ success: false, reason: 'Unauthorized' }, 401)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    // First day of CURRENT month — release jobs from here onwards
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString().split('T')[0]

    // Find all drivers whose receipt has expired (expiry < today)
    const { data: expiredDrivers, error: fetchErr } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'driver')
      .not('fee_receipt_expiry', 'is', null)
      .lt('fee_receipt_expiry', todayStr)

    if (fetchErr) {
      console.error('Error fetching expired drivers:', fetchErr)
      return json({ success: false, reason: fetchErr.message }, 500)
    }

    if (!expiredDrivers || expiredDrivers.length === 0) {
      return json({ success: true, reset: 0, message: 'No expired drivers found.' })
    }

    let resetCount = 0

    for (const driver of expiredDrivers) {
      const driverId = driver.id

      // 1. Delete all files in driver's storage folder
      const { data: files } = await admin.storage
        .from('driver-receipts')
        .list(driverId)

      if (files && files.length > 0) {
        const paths = files.map((f: { name: string }) => `${driverId}/${f.name}`)
        await admin.storage.from('driver-receipts').remove(paths)
      }

      // 2. Clear all receipt fields + set status to inactive
      await admin.from('profiles').update({
        fee_receipt_url:           null,
        fee_receipt_verified:      false,
        fee_receipt_expiry:        null,
        fee_receipt_date:          null,
        fee_receipt_amount:        null,
        fee_receipt_reject_reason: null,
        status:                    'inactive',
      }).eq('id', driverId)

      // 3. Release future accepted jobs back to pool
      await admin.from('ride_orders').update({
        status:      'pending',
        driver_id:   null,
        driver_name: null,
      })
        .eq('driver_id', driverId)
        .eq('status', 'accepted')
        .gte('date', firstOfMonth)

      resetCount++
    }

    return json({ success: true, reset: resetCount })

  } catch (err) {
    console.error('monthly-reset unhandled error:', err)
    return json({ success: false, reason: 'Server error.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
