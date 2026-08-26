// /api/send-purchase-confirmation.js — Vercel Serverless Function
//
// Отправляет письмо-подтверждение покупки + отказа от 14-дневного права на
// возврат (withdrawal right) через Resend, сразу после успешной оплаты.
// Это то самое письмо на "durable medium", требуемое Art. 16(m) Directive
// 2011/83/EU и Art. 6:230p(f) Dutch Civil Code — см. withdrawal-confirmation-
// email-template.html для контекста и юридического обоснования.
//
// ВАЖНО: использует ту же переменную окружения RESEND_API_KEY в Vercel,
// что уже настроена для /api/contact.js.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { userEmail, dreamTitle, tierLabel, price, consentDatetime, dreamUrl } = req.body || {};

  if (!userEmail || !dreamTitle || !tierLabel || price === undefined || !consentDatetime || !dreamUrl) {
    return res.status(400).json({ ok: false, error: 'Missing required fields.' });
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(userEmail)) {
    return res.status(400).json({ ok: false, error: 'Invalid email address.' });
  }

  const escapeHtml = (str) =>
    String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

  // Human-readable date for the email body (server-side, so it's consistent
  // regardless of the buyer's browser locale/timezone settings)
  const consentDate = new Date(consentDatetime);
  const consentDatetimeLabel = isNaN(consentDate.getTime())
    ? escapeHtml(consentDatetime)
    : consentDate.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';

  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Dream Grid — Payment confirmation & withdrawal notice</title>
</head>
<body style="margin:0;padding:0;background:#070918;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070918;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#0f1228;border:1px solid rgba(167,139,250,0.25);border-radius:16px;overflow:hidden;">

  <tr><td style="padding:32px 32px 16px;">
    <div style="font-family:Arial,sans-serif;font-size:18px;font-weight:800;color:#ffffff;">✦ Dream Grid</div>
  </td></tr>

  <tr><td style="padding:0 32px 8px;">
    <h1 style="font-size:20px;color:#ffffff;margin:0 0 4px;">Your dream is live ✦</h1>
    <p style="font-size:14px;color:rgba(255,255,255,0.6);margin:0;">Payment confirmation for your Dream Grid spot</p>
  </td></tr>

  <tr><td style="padding:20px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;">
      <tr><td style="padding:16px 20px;font-size:13px;color:rgba(255,255,255,0.6);">Dream</td>
          <td style="padding:16px 20px;font-size:13px;color:#ffffff;text-align:right;">${escapeHtml(dreamTitle)}</td></tr>
      <tr><td style="padding:0 20px 16px;font-size:13px;color:rgba(255,255,255,0.6);">Tier</td>
          <td style="padding:0 20px 16px;font-size:13px;color:#ffffff;text-align:right;">${escapeHtml(tierLabel)}</td></tr>
      <tr><td style="padding:0 20px 16px;font-size:13px;color:rgba(255,255,255,0.6);">Amount paid</td>
          <td style="padding:0 20px 16px;font-size:13px;color:#ffffff;text-align:right;">$${escapeHtml(String(price))}</td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 32px 8px;">
    <h2 style="font-size:15px;color:#ffffff;margin:0 0 8px;">Important — your right of withdrawal</h2>
    <p style="font-size:13px;color:rgba(255,255,255,0.65);line-height:1.7;margin:0 0 10px;">
      Your dream page is digital content, published immediately rather than delivered on a physical
      medium. On ${consentDatetimeLabel}, before completing payment, you confirmed that:
    </p>
    <ul style="font-size:13px;color:rgba(255,255,255,0.65);line-height:1.8;margin:0 0 10px;padding-left:20px;">
      <li>you requested immediate delivery of this digital content, understanding your dream page
          would be published as soon as payment was confirmed; and</li>
      <li>you acknowledged that, by giving this consent, you lose your statutory 14-day right of
          withdrawal (herroepingsrecht) for this purchase.</li>
    </ul>
    <p style="font-size:13px;color:rgba(255,255,255,0.65);line-height:1.7;margin:0;">
      This is in accordance with Article 16(m) of Directive 2011/83/EU on consumer rights and
      Article 6:230p(f) of the Dutch Civil Code (Burgerlijk Wetboek). Please keep this email for
      your records.
    </p>
  </td></tr>

  <tr><td style="padding:24px 32px 8px;">
    <p style="font-size:13px;color:rgba(255,255,255,0.65);line-height:1.7;margin:0;">
      If your dream was not successfully published due to a technical error, you may request a
      full refund within 14 days by contacting
      <a href="mailto:hello@dreamgrid.ink" style="color:#a78bfa;">hello@dreamgrid.ink</a>.
    </p>
  </td></tr>

  <tr><td style="padding:16px 32px 32px;">
    <a href="${escapeHtml(dreamUrl)}" style="display:inline-block;background:linear-gradient(135deg,#6d4df0,#9333ea);color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;">
      View your dream page →
    </a>
  </td></tr>

  <tr><td style="padding:0 32px 28px;border-top:1px solid rgba(255,255,255,0.08);">
    <p style="font-size:11px;color:rgba(255,255,255,0.35);margin:16px 0 0;">
      Dream Grid · dreamgrid.ink · This email was sent to ${escapeHtml(userEmail)} because a purchase was
      made on your Dream Grid account.
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Dream Grid <noreply@dreamgrid.ink>',
        to: [userEmail],
        subject: 'Your dream is live — payment confirmation & withdrawal notice',
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend error (purchase confirmation):', errText);
      // Return 200 anyway — a failed confirmation email should not block the
      // buyer's flow or make the purchase itself look like it failed. Failures
      // are logged server-side (Vercel logs) so they can be investigated.
      return res.status(200).json({ ok: false, error: 'Email failed to send, but was logged.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Purchase confirmation error:', err);
    return res.status(200).json({ ok: false, error: 'Server error, but logged.' });
  }
}
