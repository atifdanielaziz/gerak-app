import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    let billcode: string | null = null
    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}))
      billcode = body.billcode ?? body.billCode ?? null
    } else {
      const form = await req.formData().catch(() => null)
      billcode = (form?.get('billcode') as string) ?? null
    }
    if (!billcode) {
      // Some setups append query params instead of a body.
      billcode = new URL(req.url).searchParams.get('billcode')
    }
    if (!billcode) return json({ success: false, reason: 'Missing billcode' }, 400)

    const baseUrl = Deno.env.get('TOYYIBPAY_BASE_URL')!
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // This endpoint is public and unauthenticated — never trust the callback
    // body's own status field. Re-query ToyyibPay's own API for the bill's
    // authoritative status and act only on that.
    const verifyForm = new URLSearchParams({ billCode: billcode })
    const verifyRes  = await fetch(`${baseUrl}/index.php/api/getBillTransactions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    verifyForm,
    })
    const transactions = await verifyRes.json().catch(() => null)
    const paid = Array.isArray(transactions) &&
      transactions.some((t: any) => String(t.billpaymentStatus) === '1')

    if (!paid) return json({ success: true, note: 'Not paid yet.' })

    // Try the initial-payment bill first, then the balance-payment bill.
    const { data: initialMatch } = await admin
      .from('jubah_bookings')
      .select('id, payment_mode')
      .eq('toyyibpay_bill_code', billcode)
      .maybeSingle()

    if (initialMatch) {
      const newStatus = initialMatch.payment_mode === 'deposit' ? 'booked' : 'paid'
      // The status='ordered' guard makes this idempotent against ToyyibPay
      // retrying the callback delivery.
      const { error: updateErr } = await admin.from('jubah_bookings')
        .update({ status: newStatus, initial_paid: true, initial_paid_at: new Date().toISOString() })
        .eq('id', initialMatch.id)
        .eq('status', 'ordered')
      if (updateErr) {
        console.error('toyyibpay-callback: failed to update status:', updateErr)
        return json({ success: false, reason: updateErr.message }, 500)
      }
      return json({ success: true })
    }

    const { data: balanceMatch } = await admin
      .from('jubah_bookings')
      .select('id')
      .eq('toyyibpay_balance_bill_code', billcode)
      .maybeSingle()

    if (balanceMatch) {
      const { error: updateErr } = await admin.from('jubah_bookings')
        .update({ balance_paid: true, balance_paid_at: new Date().toISOString() })
        .eq('id', balanceMatch.id)
        .eq('balance_paid', false)
      if (updateErr) {
        console.error('toyyibpay-callback: failed to update balance_paid:', updateErr)
        return json({ success: false, reason: updateErr.message }, 500)
      }
      return json({ success: true })
    }

    return json({ success: false, reason: 'No booking matched this bill.' }, 404)

  } catch (err) {
    console.error('toyyibpay-callback unhandled error:', err)
    return json({ success: false, reason: 'Server error.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
