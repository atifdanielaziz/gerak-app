import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

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

    // Only 'ordered' — nothing paid yet — qualifies as abandoned. A
    // deposit-paid booking with an outstanding balance still has real money
    // attached to it, so that's left alone for a human to decide, same as
    // cancel_jubah_booking_admin's reasoning.
    const { data: expired, error: fetchErr } = await admin
      .from('jubah_bookings')
      .select('id, reference, toyyibpay_bill_code')
      .eq('status', 'ordered')
      .lt('created_at', cutoff)

    if (fetchErr) {
      console.error('jubah-expire-unpaid: fetch error:', fetchErr)
      return json({ success: false, reason: fetchErr.message }, 500)
    }

    if (!expired || expired.length === 0) {
      return json({ success: true, cancelled: 0 })
    }

    const baseUrl = Deno.env.get('TOYYIBPAY_BASE_URL')!
    let cancelledCount = 0
    let skippedPaidCount = 0

    for (const booking of expired) {
      // A bill code means a payment attempt actually happened at some point.
      // The row still reads 'ordered' here only if our callback never
      // applied — normally because the customer genuinely never paid, but
      // occasionally because ToyyibPay's webhook delivery failed even
      // though the payment succeeded on their end (the same gap admin's
      // manual "Confirm Payment" fallback exists for). Re-check with
      // ToyyibPay directly before cancelling, so a booking nobody ever
      // caught as actually-paid doesn't get auto-cancelled and cleaned up
      // out from under a paying customer.
      if (booking.toyyibpay_bill_code) {
        // If this check can't get a clear answer (network error, bad
        // response, anything) — skip cancelling this one rather than
        // assume unpaid. It'll be re-checked on tomorrow's run; the
        // alternative (defaulting to "unpaid" on an inconclusive check)
        // would risk auto-cancelling and deleting the documents for a
        // booking that was actually paid, right when we couldn't confirm
        // either way.
        let paid: boolean | null = null
        try {
          const verifyForm = new URLSearchParams({ billCode: booking.toyyibpay_bill_code })
          const verifyRes = await fetch(`${baseUrl}/index.php/api/getBillTransactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: verifyForm,
          })
          const transactions = await verifyRes.json()
          paid = Array.isArray(transactions) &&
            transactions.some((t: any) => String(t.billpaymentStatus) === '1')
        } catch (verifyErr) {
          console.error(`jubah-expire-unpaid: could not verify bill status for booking ${booking.id} (${booking.reference}) — skipping this run:`, verifyErr)
          continue
        }
        if (paid) {
          const note = `Booking ${booking.reference} is PAID at ToyyibPay but still 'ordered' — callback likely missed it. Auto-cancel skipped; needs manual reconciliation.`
          console.error(`jubah-expire-unpaid: ${note}`)
          await admin.from('jubah_bookings').update({
            needs_reconciliation: true,
            reconciliation_note: note,
            reconciliation_flagged_at: new Date().toISOString(),
          }).eq('id', booking.id)
          skippedPaidCount++
          continue
        }
      }

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

    return json({ success: true, cancelled: cancelledCount, skippedPaid: skippedPaidCount })

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
