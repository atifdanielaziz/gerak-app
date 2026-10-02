import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument } from 'npm:pdf-lib@1.17.1'

const ALLOWED_ORIGIN = 'https://www.gerakmy.com'
function corsHeaders(req: Request) {
  const origin = req.headers.get('origin')
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

type Booking = {
  id: string
  reference: string
  status: string
  rider_id: string | null
  ic_number: string | null
  full_name: string | null
  oscar_path: string | null
  skpg_path: string | null
  konvo_path: string | null
  ic_path: string | null
}

const BOOKING_COLUMNS = 'id,reference,status,rider_id,ic_number,full_name,oscar_path,skpg_path,konvo_path,ic_path'

// Re-merges a booking's current OSCAR/SKPG/Konvo/IC into a fresh Combined
// PDF and repoints docs_path at it — called automatically right after
// customer_replace_jubah_document / staff_replace_jubah_document succeeds,
// so the Combined PDF (originally built once, client-side, at booking
// submission — see Jubah.tsx's generateCombinedBlob) doesn't go stale the
// moment one of its four source documents is replaced.
//
// This has to run server-side rather than client-side like the original
// generation does: a customer's browser has no Storage read access to the
// other three documents (RLS only lets admin/superadmin/assigned-rider read
// jubah-docs objects), and re-running the merge from only the one just-
// replaced file would silently drop the other three pages. The service-role
// client here bypasses that RLS the same way the three replace RPCs bypass
// it at the DB layer.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })

  try {
    const { bookingId, reference, icLast4 } = await req.json().catch(() => ({}))
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let booking: Booking | null = null
    let actorId: string | null = null
    let actorName = 'Unknown'
    let actorRole = 'customer'

    if (bookingId) {
      // Rider (own assigned booking) / superadmin path — same authorization
      // shape as staff_replace_jubah_document in the migration.
      const authHeader = req.headers.get('Authorization') ?? ''
      const jwt = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
      if (authErr || !user) return json({ success: false, error: 'Not authenticated.' }, 401)

      const { data: b } = await admin.from('jubah_bookings').select(BOOKING_COLUMNS).eq('id', bookingId).maybeSingle<Booking>()
      if (!b) return json({ success: false, error: 'Booking not found.' }, 404)

      const { data: profile } = await admin.from('profiles').select('role, name').eq('id', user.id).maybeSingle()
      const isSuperadmin = profile?.role === 'superadmin'
      if (!(isSuperadmin || b.rider_id === user.id)) return json({ success: false, error: 'Not authorised.' }, 403)

      booking = b
      actorId = user.id
      actorName = profile?.name ?? 'Unknown'
      actorRole = profile?.role ?? 'rider'
    } else if (reference && icLast4) {
      // Customer self-service path — same reference + last-4-IC gate as
      // get_jubah_receipt / customer_replace_jubah_document.
      const { data: b } = await admin.from('jubah_bookings').select(BOOKING_COLUMNS).eq('reference', reference).maybeSingle<Booking>()
      if (!b) return json({ success: false, error: 'Booking not found.' }, 404)
      const last4 = (b.ic_number ?? '').replace(/\D/g, '').slice(-4)
      if (!last4 || last4 !== icLast4) return json({ success: false, error: 'Incorrect IC digits.' }, 403)

      booking = b
      actorName = `${b.full_name ?? 'Customer'} (self-service)`
      actorRole = 'customer'
    } else {
      return json({ success: false, error: 'Missing booking identifier.' }, 400)
    }

    // Same lock as the replace RPCs — if a replace that just happened was
    // allowed, this should be too, but re-checked here independently since
    // this is reachable as its own call, not just chained after a replace.
    if (!['ordered', 'paid'].includes(booking.status)) {
      return json({ success: false, error: 'This order is already being processed and can no longer be edited.' }, 400)
    }

    const fields: { label: string; path: string | null }[] = [
      { label: 'OSCAR', path: booking.oscar_path },
      { label: 'SKPG', path: booking.skpg_path },
      { label: 'Konvo Slip', path: booking.konvo_path },
      { label: 'IC Copy', path: booking.ic_path },
    ]
    if (fields.some(f => !f.path)) {
      return json({ success: false, error: 'All four documents must be uploaded before the combined PDF can be regenerated.' }, 400)
    }

    const merged = await PDFDocument.create()
    for (const f of fields) {
      const { data: blob, error: dlErr } = await admin.storage.from('jubah-docs').download(f.path!)
      if (dlErr || !blob) {
        console.error('jubah-doc-combine: download failed for', f.label, dlErr)
        return json({ success: false, error: `Could not read ${f.label}.` }, 500)
      }
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const contentType = blob.type
      if (contentType === 'application/pdf') {
        const doc = await PDFDocument.load(bytes)
        const pages = await merged.copyPages(doc, doc.getPageIndices())
        pages.forEach(p => merged.addPage(p))
      } else {
        const page = merged.addPage()
        const img = contentType === 'image/png' ? await merged.embedPng(bytes) : await merged.embedJpg(bytes)
        const { width, height } = img.scale(1)
        page.setSize(width, height)
        page.drawImage(img, { x: 0, y: 0, width, height })
      }
    }

    const pdfBytes = await merged.save()
    // Matches Jubah.tsx's original uploadFile() naming convention
    // ({reference}/{Name}_{label}_{timestamp}.{ext}) so a downloaded file
    // shows the student's name instead of a bare "combined_<timestamp>.pdf".
    const namePart = (booking.full_name || 'combined').replace(/\s+/g, '_')
    const newPath = `${booking.reference}/${namePart}_combined_${Date.now()}.pdf`
    const { error: upErr } = await admin.storage.from('jubah-docs')
      .upload(newPath, pdfBytes, { contentType: 'application/pdf', upsert: false })
    if (upErr) {
      console.error('jubah-doc-combine: upload failed', upErr)
      return json({ success: false, error: 'Failed to save combined PDF.' }, 500)
    }

    await admin.from('jubah_bookings').update({ docs_path: newPath }).eq('id', booking.id)
    await admin.from('admin_activity_log').insert({
      actor_id: actorId,
      actor_name: actorName,
      actor_role: actorRole,
      table_name: 'jubah_bookings',
      record_id: booking.id,
      action: 'regenerate_combined_pdf',
      changes: { new_path: newPath },
    })

    return json({ success: true, path: newPath })
  } catch (err) {
    console.error('jubah-doc-combine unhandled error:', err)
    return json({ success: false, error: 'Server error.' }, 500)
  }
})
