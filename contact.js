// /api/contact.js — Vercel Serverless Function
//
// Принимает POST-запрос с формы обратной связи (contact.html) и отправляет
// письмо через Resend на hello@dreamgrid.ink. Использует тот же сервис
// (Resend), что уже подключён у Dream Grid для транзакционных писем.
//
// ВАЖНО: для работы нужен переменная окружения RESEND_API_KEY в Vercel
// (Project → Settings → Environment Variables). Сейчас этот ключ существует
// только как секрет в Supabase Edge Functions — сюда, в Vercel, его нужно
// добавить отдельно (это не автоматически, см. инструкцию в чате).

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { name, email, message, company } = req.body || {};

  // Honeypot: если скрытое поле "company" заполнено — это бот, тихо отклоняем
  if (company) {
    return res.status(200).json({ ok: true });
  }

  if (!name || !email || !message) {
    return res.status(400).json({ ok: false, error: 'Missing required fields.' });
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return res.status(400).json({ ok: false, error: 'Invalid email address.' });
  }
  if (message.length > 5000) {
    return res.status(400).json({ ok: false, error: 'Message is too long.' });
  }

  const escapeHtml = (str) =>
    String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Dream Grid Contact Form <noreply@dreamgrid.ink>',
        to: ['hello@dreamgrid.ink'],
        reply_to: email,
        subject: `New contact form message from ${name}`,
        html: `
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Message:</strong></p>
          <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
        `,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend error:', errText);
      return res.status(502).json({ ok: false, error: 'Failed to send message.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact form error:', err);
    return res.status(500).json({ ok: false, error: 'Server error.' });
  }
}
