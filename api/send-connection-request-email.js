// /api/send-connection-request-email.js — Vercel Serverless Function
//
// Отправляет письмо-уведомление получателю запроса на объединение мечт
// (фича "Similar Dreams" → кнопка "🤝 Connect"). Вызывается автоматически
// из dashboard.html сразу после успешного создания строки в dream_connections.
//
// Email получателя не хранится в открытой таблице `profiles` (это приватные
// данные из auth.users), поэтому письмо не может быть отправлено напрямую
// из браузера — функция сама подтягивает все данные по connectionId через
// Supabase service role (тот же паттерн, что и в /api/cancel-dream.js).
//
// ВАЖНО: нужна уже существующая переменная окружения в Vercel:
//   SUPABASE_SERVICE_ROLE_KEY — service role ключ Supabase (Settings → API)
//   RESEND_API_KEY            — тот же ключ, что и у остальных писем Dream Grid

const SUPABASE_URL = 'https://wnbgwonqpjwzdgcngkxi.supabase.co';

function supabaseHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function fetchConnection(connectionId) {
  const url = `${SUPABASE_URL}/rest/v1/dream_connections?id=eq.${encodeURIComponent(connectionId)}&select=*`;
  const res = await fetch(url, { headers: supabaseHeaders() });
  if (!res.ok) throw new Error('Supabase lookup failed: ' + (await res.text()));
  const rows = await res.json();
  return rows[0] || null;
}

async function fetchDream(dreamId) {
  const url = `${SUPABASE_URL}/rest/v1/dreams?id=eq.${encodeURIComponent(dreamId)}&select=id,title`;
  const res = await fetch(url, { headers: supabaseHeaders() });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function fetchProfile(userId) {
  const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,nickname`;
  const res = await fetch(url, { headers: supabaseHeaders() });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function fetchUserEmail(userId) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { headers: supabaseHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { connectionId } = req.body || {};
  if (!connectionId) {
    return res.status(400).json({ ok: false, error: 'Missing connectionId.' });
  }

  try {
    const connection = await fetchConnection(connectionId);
    if (!connection || connection.status !== 'pending') {
      // Запись не найдена или уже не pending — не шлём письмо, но и не считаем это ошибкой клиента
      return res.status(200).json({ ok: false, error: 'Connection not found or not pending.' });
    }

    const [requesterDream, targetDream, requesterProfile, targetEmail] = await Promise.all([
      fetchDream(connection.requester_dream_id),
      fetchDream(connection.target_dream_id),
      fetchProfile(connection.requester_user_id),
      fetchUserEmail(connection.target_user_id),
    ]);

    if (!targetEmail) {
      return res.status(200).json({ ok: false, error: 'Target user has no email on file.' });
    }

    const escapeHtml = (str) =>
      String(str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[c]));

    const requesterName = escapeHtml(requesterProfile?.nickname || 'A fellow dreamer');
    const requesterDreamTitle = escapeHtml(requesterDream?.title || 'their dream');
    const targetDreamTitle = escapeHtml(targetDream?.title || 'your dream');

    const html = `
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Dream Grid — New connection request</title></head>
<body style="margin:0;padding:0;background:#070918;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070918;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#0f1228;border:1px solid rgba(167,139,250,0.25);border-radius:16px;overflow:hidden;">

  <tr><td style="padding:32px 32px 16px;">
    <div style="font-family:Arial,sans-serif;font-size:18px;font-weight:800;color:#ffffff;">✦ Dream Grid</div>
  </td></tr>

  <tr><td style="padding:0 32px 8px;">
    <h1 style="font-size:20px;color:#ffffff;margin:0 0 4px;">🤝 Someone wants to connect</h1>
    <p style="font-size:14px;color:rgba(255,255,255,0.6);margin:0;">${requesterName} has a dream just like yours.</p>
  </td></tr>

  <tr><td style="padding:20px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;">
      <tr><td style="padding:16px 20px;font-size:13px;color:rgba(255,255,255,0.6);">Their dream</td>
          <td style="padding:16px 20px;font-size:13px;color:#ffffff;text-align:right;">${requesterDreamTitle}</td></tr>
      <tr><td style="padding:0 20px 16px;font-size:13px;color:rgba(255,255,255,0.6);">Your dream</td>
          <td style="padding:0 20px 16px;font-size:13px;color:#ffffff;text-align:right;">${targetDreamTitle}</td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 32px 28px;" align="center">
    <a href="https://www.dreamgrid.ink/dashboard" style="display:inline-block;background:linear-gradient(135deg,#7c5cf6,#a78bfa);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:10px;">
      View request →
    </a>
    <p style="font-size:12px;color:rgba(255,255,255,0.45);line-height:1.6;margin:16px 0 0;">
      Go to your Dashboard → 🤝 Connections tab to accept or decline.
    </p>
  </td></tr>

  <tr><td style="padding:0 32px 28px;border-top:1px solid rgba(255,255,255,0.08);">
    <p style="font-size:11px;color:rgba(255,255,255,0.35);margin:16px 0 0;">
      Dream Grid · dreamgrid.ink · This email was sent to you because someone requested to connect
      their dream with yours on Dream Grid.
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Dream Grid <noreply@dreamgrid.ink>',
        to: [targetEmail],
        subject: `${requesterProfile?.nickname || 'Someone'} wants to connect on Dream Grid`,
        html,
      }),
    });

    if (!resendRes.ok) {
      console.error('Resend error (connection request):', await resendRes.text());
      return res.status(200).json({ ok: false, error: 'Email failed to send, but was logged.' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Connection request email error:', err);
    return res.status(200).json({ ok: false, error: 'Server error, but logged.' });
  }
}
