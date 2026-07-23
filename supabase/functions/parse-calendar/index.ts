import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

const PROMPT = `You are parsing a UMPSA (Universiti Malaysia Pahang Al-Sultan Abdullah) academic calendar PDF.

Extract ALL academic events and return ONLY valid JSON — no markdown, no explanation, just the raw JSON object.

Required format:
{
  "academic_year": "2026/2027",
  "semesters": [
    {
      "id": "prelim",
      "label": "Preliminary Semester 2026/2027 (Diploma)",
      "short": "Prelim",
      "events": [
        {
          "type": "registration",
          "title": "Registration — New Students (Diploma)",
          "date": "19 July 2026",
          "duration": "1 Day",
          "notes": [],
          "start": "2026-07-19",
          "end": "2026-07-19"
        }
      ]
    }
  ],
  "holidays": [
    { "date": "2026-07-31", "label": "Birthday of KDPB Sultan Pahang" },
    { "date": "2026-08-25", "label": "Maulidur Rasul" }
  ]
}

Rules:
- "type" must be exactly one of: registration, orientation, lectures, break, study, exam
- Use "study" for Study Week activities
- Use "break" for Mid-Semester Break
- Semester "id" must be exactly one of: prelim, sem1, sem2, short
- "holidays" = every public holiday, replacement leave, and no-exam date in the Remarks column, each with a short human-readable "label" naming what it is (e.g. "Hari Raya Aidil Fitri 1448H", "Replacement Leave (Deepavali)") — never leave "label" blank
- All dates in ISO yyyy-mm-dd format
- "start" and "end" are the first and last day of the activity (inclusive)
- Return ONLY the JSON object`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    // Auth check
    const auth = req.headers.get('Authorization');
    if (!auth) return new Response('Unauthorized', { status: 401, headers: CORS });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response('Unauthorized', { status: 401, headers: CORS });

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single();

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return new Response('Forbidden', { status: 403, headers: CORS });
    }

    // Parse PDF from FormData
    const form = await req.formData();
    const file = form.get('pdf') as File | null;
    if (!file) return new Response('No PDF provided', { status: 400, headers: CORS });

    // Convert to base64
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    // Call Claude
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          },
          { type: 'text', text: PROMPT },
        ],
      }],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    // Strip accidental markdown fences
    const json = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    const parsed = JSON.parse(json);

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('parse-calendar:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
