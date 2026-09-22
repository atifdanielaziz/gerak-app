import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const ALLOWED_ORIGIN = 'https://www.gerakmy.com'
function corsHeaders(req: Request) {
  const origin = req.headers.get('origin')
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

// Same timing-safe compare as ride-orders-expire-pending — this is
// trigger-only (called from notify_new_ride_order() with the vault's
// service-role secret), never reachable from a browser.
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a)
  const bufB = new TextEncoder().encode(b)
  if (bufA.length !== bufB.length) return false
  let diff = 0
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i]
  return diff === 0
}

// "Fake bold" via Unicode Mathematical Sans-Serif Bold — real push
// notification bodies don't render HTML/Markdown on any platform, so this
// is the only way to make fare/pickup/destination visually pop out from
// the rest of the text. Covers digits, upper and lower case — pickup and
// destination are free-text place names (e.g. "UMP Pekan / Fakulti"),
// not just RM amounts, so unlike the fare-only version this needs the
// lowercase range too. Anything outside those three ranges (spaces,
// slashes, punctuation) passes through unchanged — there's no bold glyph
// for it in this Unicode block.
//
// Every character in this block is outside the BMP (a surrogate pair, 2
// UTF-16 units each) — plain string indexing (BOLD_DIGITS[i]) grabs a
// lone surrogate half instead of a full character, producing invalid
// output. Array.from() splits by code point instead, so each array entry
// is one real character.
const BOLD_DIGITS = Array.from('𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵')
const BOLD_UPPER  = Array.from('𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭')
const BOLD_LOWER  = Array.from('𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇')
function toBold(text: string): string {
  return text.split('').map(ch => {
    if (ch >= '0' && ch <= '9') return BOLD_DIGITS[ch.charCodeAt(0) - 48]
    if (ch >= 'A' && ch <= 'Z') return BOLD_UPPER[ch.charCodeAt(0) - 65]
    if (ch >= 'a' && ch <= 'z') return BOLD_LOWER[ch.charCodeAt(0) - 97]
    return ch
  }).join('')
}

type RideOrder = {
  id: string
  campus: string
  pickup: string
  destination: string
  fare: string
  night_charge: number
  customer_name: string
  status: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    if (!timingSafeEqual(token, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')) {
      return json({ success: false, reason: 'Unauthorized' }, 401)
    }

    const { order_id } = await req.json().catch(() => ({}))
    if (!order_id) return json({ success: false, reason: 'order_id required' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: order, error: orderErr } = await admin
      .from('ride_orders')
      .select('id,campus,pickup,destination,fare,night_charge,customer_name,status')
      .eq('id', order_id)
      .maybeSingle<RideOrder>()
    if (orderErr || !order || order.status !== 'pending') {
      return json({ success: true, sent: 0, reason: 'order not found or no longer pending' })
    }

    // Same eligible-driver definition DriverHome.tsx's realtime subscription
    // already uses: same campus (case-insensitive — 'Pekan' vs 'pekan'),
    // can_drive true, not suspended. Not scoped by driver_id since this is
    // an open pool — every eligible driver in-campus can accept it.
    const { data: subs, error: subsErr } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, profiles!inner(campus, can_drive, status)')
      .eq('profiles.can_drive', true)
      .neq('profiles.status', 'inactive')
      .ilike('profiles.campus', order.campus)
    if (subsErr) {
      console.error('send-ride-order-push: subs query error:', subsErr)
      return json({ success: false, reason: subsErr.message }, 500)
    }
    if (!subs || subs.length === 0) return json({ success: true, sent: 0 })

    const fareText = order.fare === 'TBC' ? 'TBC' : `RM${(Number(order.fare) + order.night_charge).toFixed(0)}`
    const title = 'Gerak — New Ride Request'
    const body = `${toBold(fareText)} · ${toBold(order.pickup)} → ${toBold(order.destination)}`
    const payload = JSON.stringify({
      title,
      body,
      tag: 'gerak-new-order',
      data: { url: '/' },
    })

    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT')!,
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    )

    let sent = 0
    let failed = 0
    const staleIds: string[] = []

    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
        sent++
      } catch (err) {
        failed++
        // 404/410 means the browser/OS has permanently invalidated this
        // subscription (uninstalled, permission revoked, endpoint expired)
        // — nothing will ever succeed against it again, so clean it up
        // instead of retrying it on every future order forever.
        const statusCode = (err as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) staleIds.push(sub.id)
        else console.error('send-ride-order-push: push failed for', sub.id, err)
      }
    }))

    if (staleIds.length > 0) {
      await admin.from('push_subscriptions').delete().in('id', staleIds)
    }

    return json({ success: true, sent, failed, removed: staleIds.length })
  } catch (err) {
    console.error('send-ride-order-push unhandled error:', err)
    return json({ success: false, reason: 'Server error.' }, 500)
  }
})
