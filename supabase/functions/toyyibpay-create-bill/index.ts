import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ToyyibPay doesn't collect a real customer email anywhere in the Jubah
// booking form — createBill requires one, so a fixed placeholder is used.
const PLACEHOLDER_EMAIL = 'jubah@atepgerak.app'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { reference, hp_number, stage } = await req.json()
    if (!reference || !hp_number || (stage !== 'initial' && stage !== 'balance')) {
      return json({ success: false, error: 'Missing or invalid parameters.' }, 400)
    }

    // Ownership check: reference + hp_number together, same pairing
    // submit_jubah_balance already relies on — a stranger who only knows
    // the reference can't spin up bills for someone else's booking.
    const { data: booking, error: fetchErr } = await admin
      .from('jubah_bookings')
      .select('id, reference, hp_number, full_name, payment_mode, status, cost, balance_due, balance_paid')
      .eq('reference', reference)
      .eq('hp_number', hp_number)
      .single()

    if (fetchErr || !booking) {
      return json({ success: false, error: 'Booking not found.' }, 404)
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
      billEmail:               PLACEHOLDER_EMAIL,
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
