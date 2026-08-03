import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Locked to the real app origin instead of '*'.
const ALLOWED_ORIGIN = 'https://www.gerakmy.com'
function corsHeaders(req: Request) {
  const origin = req.headers.get('origin')
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

// Fallback only — bookings made before email collection was added to the
// Jubah form have no real email on file, and createBill requires one.
const PLACEHOLDER_EMAIL = 'jubah@atepgerak.app'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { reference, hp_number, stage } = await req.json()
    if (!reference || !hp_number || (stage !== 'initial' && stage !== 'balance')) {
      return json({ success: false, error: 'Missing or invalid parameters.' }, 400)
    }

    // Same reference+hp_number brute-force surface as cancel_jubah_booking_customer
    // and submit_jubah_balance — shares their rate limit.
    const { error: rateLimitErr } = await admin.rpc('check_jubah_rate_limit')
    if (rateLimitErr) {
      return json({ success: false, error: 'Too many requests right now. Please wait a minute and try again.' }, 429)
    }

    // Ownership check: reference + hp_number together, same pairing
    // submit_jubah_balance already relies on — a stranger who only knows
    // the reference can't spin up bills for someone else's booking.
    const { data: booking, error: fetchErr } = await admin
      .from('jubah_bookings')
      .select('id, reference, hp_number, full_name, email, payment_mode, status, cost, balance_due, balance_paid, toyyibpay_bill_code, toyyibpay_balance_bill_code')
      .eq('reference', reference)
      .eq('hp_number', hp_number)
      .single()

    if (fetchErr || !booking) {
      return json({ success: false, error: 'Booking not found.' }, 404)
    }

    // Checked before anything stage-specific — a cancelled booking should
    // never be payable again, regardless of what it owed beforehand. The
    // stage-specific checks below don't independently catch this (balance
    // stage in particular: none of its own conditions rule out a cancelled
    // booking with an unpaid balance), so this was previously letting a
    // real, payable bill get created for a dead booking.
    if (booking.status === 'cancelled') {
      return json({ success: false, error: 'This booking has been cancelled.' })
    }

    let amount: number
    if (stage === 'initial') {
      if (booking.status !== 'ordered') {
        return json({ success: false, error: 'This booking has already been paid.' })
      }
      amount = Number(booking.cost)
    } else {
      if (booking.status === 'ordered') {
        return json({ success: false, error: 'Please complete your initial payment first.' })
      }
      if (booking.payment_mode !== 'deposit' || Number(booking.balance_due) <= 0 || booking.balance_paid) {
        return json({ success: false, error: 'No outstanding balance for this booking.' })
      }
      amount = Number(booking.balance_due)
    }

    const baseUrl     = Deno.env.get('TOYYIBPAY_BASE_URL')!
    const appBaseUrl  = Deno.env.get('APP_BASE_URL')!
    const functionsUrl = `${Deno.env.get('SUPABASE_URL')!}/functions/v1/toyyibpay-callback`

    // Reuse an existing unpaid bill for this stage instead of minting a new
    // one — the callback matches purely on the bill code stored on this row,
    // so creating a fresh bill on every call (e.g. a "Pay Now" retry after
    // the customer hit back on ToyyibPay's checkout) would overwrite that
    // column and orphan the earlier bill: if they then completed payment on
    // the old, still-open tab, the callback would find no matching booking
    // and the payment would go through with the order never marked paid.
    // The stage checks above already confirm this booking is still payable,
    // so an existing code here is guaranteed to still be awaiting payment.
    const existingBillCode = stage === 'initial' ? booking.toyyibpay_bill_code : booking.toyyibpay_balance_bill_code
    if (existingBillCode) {
      return json({ success: true, paymentUrl: `${baseUrl}/${existingBillCode}` })
    }

    const form = new URLSearchParams({
      userSecretKey:           Deno.env.get('TOYYIBPAY_SECRET_KEY')!,
      categoryCode:            Deno.env.get('TOYYIBPAY_CATEGORY_CODE')!,
      billName:                stage === 'initial' ? 'Jubah Payment' : 'Jubah Balance Payment',
      billDescription:         `Jubah ${stage === 'initial' ? 'payment' : 'balance'} for ${booking.reference}`,
      billPriceSetting:        '1',
      billPayorInfo:           '1',
      billAmount:              String(Math.round(amount * 100)),
      billReturnUrl:           `${appBaseUrl}/jubah/track?reference=${encodeURIComponent(booking.reference)}`,
      billCallbackUrl:         functionsUrl,
      billExternalReferenceNo: `${booking.reference}-${stage}`,
      billTo:                  booking.full_name,
      // Real customer email when we have one (bookings made after email
      // collection was added) — falls back to the placeholder only for
      // legacy bookings that predate that field.
      billEmail:               booking.email || PLACEHOLDER_EMAIL,
      billPhone:               booking.hp_number,
      billPaymentChannel:      '2',
      billDisplayMerchant:     '1',
    })

    const billRes  = await fetch(`${baseUrl}/index.php/api/createBill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    const billText = await billRes.text()

    let billData: any
    try { billData = JSON.parse(billText) } catch {
      console.error('toyyibpay-create-bill: non-JSON response:', billText)
      return json({ success: false, error: 'Payment gateway unavailable. Please try again.' }, 502)
    }

    const billCode = Array.isArray(billData) ? billData[0]?.BillCode : undefined
    if (!billCode) {
      console.error('toyyibpay-create-bill: createBill failed:', billText)
      return json({ success: false, error: 'Could not start payment. Please try again.' }, 502)
    }

    const column = stage === 'initial' ? 'toyyibpay_bill_code' : 'toyyibpay_balance_bill_code'
    await admin.from('jubah_bookings').update({ [column]: billCode }).eq('id', booking.id)

    return json({ success: true, paymentUrl: `${baseUrl}/${billCode}` })

  } catch (err) {
    console.error('toyyibpay-create-bill unhandled error:', err)
    return json({ success: false, error: 'Server error. Please try again.' }, 500)
  }
})
