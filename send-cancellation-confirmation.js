// /api/send-cancellation-confirmation.js — Vercel Serverless Function
//
// Отправляет немедленное подтверждение отмены покупки (Art. 6:230o BW
// требует подтверждение получения отказа "без промедления", с содержанием,
// датой и временем). Вызывается автоматически из /api/cancel-dream.js
// сразу после успешного возврата через PayPal.
//
// Использует ту же переменную окружения RESEND_API_KEY, что и остальные
// письма Dream Grid.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { userEmail, dreamTitle, tierLabel, price, cancelledAt } = req.body || {};
  if (!userEmail || !dreamTitle || !cancelledAt) {
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

  const cancelDate = new Date(cancelledAt);
  const cancelDateLabel = isNaN(cancelDate.getTime())
    ? escapeHtml(cancelledAt)
    : cancelDate.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';

  const html = `
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Dream Grid — Cancellation confirmed</title></head>
<body style="margin:0;padding:0;background:#070918;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070918;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#0f1228;border:1px solid rgba(167,139,250,0.25);border-radius:16px;overflow:hidden;">

  <tr><td style="padding:32px 32px 16px;">
    <div style="font-family:Arial,sans-serif;font-size:18px;font-weight:800;color:#ffffff;">✦ Dream Grid</div>
  </td></tr>

  <tr><td style="padding:0 32px 8px;">
    <h1 style="font-size:20px;color:#ffffff;margin:0 0 4px;">Your cancellation is confirmed</h1>
    <p style="font-size:14px;color:rgba(255,255,255,0.6);margin:0;">We've received your withdrawal request and processed your refund.</p>
  </td></tr>

  <tr><td style="padding:20px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;">
      <tr><td style="padding:16px 20px;font-size:13px;color:rgba(255,255,255,0.6);">Dream</td>
          <td style="padding:16px 20px;font-size:13px;color:#ffffff;text-align:right;">${escapeHtml(dreamTitle)}</td></tr>
      <tr><td style="padding:0 20px 16px;font-size:13px;color:rgba(255,255,255,0.6);">Tier (before cancellation)</td>
          <td style="padding:0 20px 16px;font-size:13px;color:#ffffff;text-align:right;">${escapeHtml(tierLabel || '')}</td></tr>
      <tr><td style="padding:0 20px 16px;font-size:13px;color:rgba(255,255,255,0.6);">Amount refunded</td>
          <td style="padding:0 20px 16px;font-size:13px;color:#ffffff;text-align:right;">$${escapeHtml(String(price))}</td></tr>
      <tr><td style="padding:0 20px 16px;font-size:13px;color:rgba(255,255,255,0.6);">Cancelled on</td>
          <td style="padding:0 20px 16px;font-size:13px;color:#ffffff;text-align:right;">${cancelDateLabel}</td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 32px 28px;">
    <p style="font-size:13px;color:rgba(255,255,255,0.65);line-height:1.7;margin:0;">
      Your spot has been removed from Dream Grid and your payment has been refunded to your
      original PayPal payment method. Refunds typically appear within 5–10 business days,
      depending on your bank or card issuer.
    </p>
    <p style="font-size:13px;color:rgba(255,255,255,0.65);line-height:1.7;margin:16px 0 0;">
      Questions? Reach us at <a href="mailto:hello@dreamgrid.ink" style="color:#a78bfa;">hello@dreamgrid.ink</a>.
    </p>
  </td></tr>

  <tr><td style="padding:0 32px 28px;border-top:1px solid rgba(255,255,255,0.08);">
    <p style="font-size:11px;color:rgba(255,255,255,0.35);margin:16px 0 0;">
      Dream Grid · dreamgrid.ink · This email was sent to ${escapeHtml(userEmail)} to confirm a
      cancellation on your Dream Grid account.
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
        subject: 'Your Dream Grid cancellation is confirmed',
        html,
      }),
    });

    if (!resendRes.ok) {
      console.error('Resend error (cancellation confirmation):', await resendRes.text());
      return res.status(200).json({ ok: false, error: 'Email failed to send, but was logged.' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Cancellation confirmation error:', err);
    return res.status(200).json({ ok: false, error: 'Server error, but logged.' });
  }
}
