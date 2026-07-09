const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const b64url = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const header  = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss:   clientEmail,
    scope: 'https://www.googleapis.com/auth/drive',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  };

  const signingInput = `${b64url(header)}.${b64url(payload)}`;

  const pemBody = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
  const binaryKey = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const jwt = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  const { access_token, error } = await res.json();
  if (!access_token) throw new Error(`Auth failed: ${JSON.stringify(error)}`);
  return access_token;
}

async function uploadFile(
  token: string,
  buffer: ArrayBuffer,
  filename: string,
  mimeType: string,
  folderId: string,
): Promise<string> {
  const metadata = { name: filename, parents: [folderId] };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([buffer], { type: mimeType }));

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  const { id, webViewLink, error } = await uploadRes.json();
  if (!id) throw new Error(`Upload failed: ${JSON.stringify(error)}`);

  // Make viewable by anyone with the link
  await fetch(`https://www.googleapis.com/drive/v3/files/${id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  return webViewLink as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405, headers: CORS });

  try {
    const clientEmail = Deno.env.get('GDRIVE_CLIENT_EMAIL')!;
    const privateKey  = Deno.env.get('GDRIVE_PRIVATE_KEY')!.replace(/\\n/g, '\n');
    const folderId    = Deno.env.get('GDRIVE_FOLDER_ID')!;

    const form     = await req.formData();
    const file     = form.get('file') as File;
    const filename = (form.get('filename') as string | null) ?? file.name;
    const mimeType = (form.get('mimeType') as string | null) ?? file.type;

    const buffer = await file.arrayBuffer();
    const token  = await getAccessToken(clientEmail, privateKey);
    const url    = await uploadFile(token, buffer, filename, mimeType, folderId);

    return new Response(JSON.stringify({ url }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[upload-to-drive]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
