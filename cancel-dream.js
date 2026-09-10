// /api/cancel-dream.js — Vercel Serverless Function
//
// Реализует 14-дневное право отказа (Art. 6:230o–6:230p BW / Art. 9-16
// Directive 2011/83/EU): владелец ссылки-токена (пришла в письме-
// подтверждении покупки) может в течение 14 дней с момента оплаты
// отменить покупку — деньги автоматически возвращаются через PayPal,
// место снимается с карты.
//
// GET  /api/cancel-dream?cell=<id>&token=<token>   — получить статус/детали
// POST /api/cancel-dream { cell, token }           — выполнить отмену
//
// Доступ по токену (не по логину/сессии), потому что покупатель может
// открыть ссылку из письма в любом браузере, не заходя в аккаунт — это
// специально, чтобы отмена была "легко доступной", как требует закон.
//
// ВАЖНО: нужны переменные окружения в Vercel:
//   SUPABASE_SERVICE_ROLE_KEY — service role ключ Supabase (Settings → API)
//   PAYPAL_CLIENT_SECRET      — секрет того же PayPal-приложения, чей
//                               публичный Client ID уже используется на сайте
// PayPal работает в Live-режиме (api-m.paypal.com), т.к. сайт принимает
// настоящие платежи.

const SUPABASE_URL = 'https://wnbgwonqpjwzdgcngkxi.supabase.co';
const PAYPAL_CLIENT_ID = 'AXdTcQ4rHmU9FJNYicH7_LRkYKLFd8Npr9EuRXxWq9trt01o7ABujwWL01OmpVoC-YEQ0ZdI3ZlKvpGV';
const PAYPAL_API_BASE = 'https://api-m.paypal.com';
const WITHDRAWAL_WINDOW_DAYS = 14;

function supabaseHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function fetchCellByToken(cellId, token) {
  const url = `${SUPABASE_URL}/rest/v1/cells?id=eq.${encodeURIComponent(cellId)}&cancel_token=eq.${encodeURIComponent(token)}&select=*,dreams(id,title)`;
  const res = await fetch(url, { headers: supabaseHeaders() });
  if (!res.ok) throw new Error('Supabase lookup failed: ' + (await res.text()));
  const rows = await res.json();
  return rows[0] || null;
}

async function fetchUserEmail(userId) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { headers: supabaseHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email || null;
}

async function updateCell(cellId, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/cells?id=eq.${encodeURIComponent(cellId)}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Supabase update failed: ' + (await res.text()));
}

async function paypalAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('PayPal auth failed: ' + (await res.text()));
  const data = await res.json();
  return data.access_token;
}

async function refundPayPalOrder(orderId, accessToken) {
  // Заказ хранит order id; для возврата нужен capture id — получаем его через order details
  const orderRes = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!orderRes.ok) throw new Error('PayPal order lookup failed: ' + (await orderRes.text()));
  const order = await orderRes.json();
  const captureId = order?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
  if (!captureId) throw new Error('No capture id found on PayPal order.');

  const refundRes = await fetch(`${PAYPAL_API_BASE}/v2/payments/captures/${captureId}/refund`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ note_to_payer: 'Dream Grid — refund for cancelled purchase (14-day right of withdrawal)' }),
  });
  if (!refundRes.ok) throw new Error('PayPal refund failed: ' + (await refundRes.text()));
  return refundRes.json();
}

function computeStatus(cell) {
  const purchasedAt = new Date(cell.purchased_at);
  const deadlineAt = new Date(purchasedAt.getTime() + WITHDRAWAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();
  return {
    purchasedAt: purchasedAt.toISOString(),
    deadlineAt: deadlineAt.toISOString(),
    expired: now > deadlineAt,
    cancelled: !!cell.cancelled_at,
  };
}

export default async function handler(req, res) {
  const cellId = req.method === 'GET' ? req.query.cell : req.body?.cell;
  const token = req.method === 'GET' ? req.query.token : req.body?.token;

  if (!cellId || !token) {
    return res.status(400).json({ ok: false, error: 'Missing cell or token.' });
  }

  let cell;
  try {
    cell = await fetchCellByToken(cellId, token);
  } catch (err) {
    console.error('cancel-dream lookup error:', err);
    return res.status(500).json({ ok: false, error: 'Lookup failed.' });
  }
  if (!cell) {
    return res.status(404).json({ ok: false, error: 'Not found. Check the link from your confirmation email.' });
  }

  const status = computeStatus(cell);
  const dream = Array.isArray(cell.dreams) ? cell.dreams[0] : cell.dreams;

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      dreamTitle: dream?.title || null,
      tier: cell.tier,
      price: cell.price,
      ...status,
      refundEligible: !status.cancelled && !status.expired && !!cell.paypal_order_id,
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // ── POST: выполняем отмену ──
  if (status.cancelled) {
    return res.status(200).json({ ok: false, error: 'This purchase was already cancelled.' });
  }
  if (status.expired) {
    return res.status(200).json({ ok: false, error: 'The 14-day withdrawal period for this purchase has ended.' });
  }
  if (!cell.paypal_order_id) {
    return res.status(200).json({ ok: false, error: 'No payment on file for this spot — nothing to refund.' });
  }

  try {
    const accessToken = await paypalAccessToken();
    await refundPayPalOrder(cell.paypal_order_id, accessToken);
  } catch (err) {
    console.error('PayPal refund error:', err);
    return res.status(502).json({ ok: false, error: 'Refund could not be processed automatically. We have been notified — please also email hello@dreamgrid.ink.' });
  }

  const cancelledAt = new Date().toISOString();
  try {
    await updateCell(cell.id, { status: 'cancelled', cancelled_at: cancelledAt, tier: 'free', price: 0 });
  } catch (err) {
    console.error('cancel-dream DB update error (refund already issued!):', err);
    // Возврат уже прошёл — сообщаем пользователю успех, но логируем для ручной проверки статуса записи
  }

  // Немедленное письмо-подтверждение отмены (durable medium, Art. 6:230o BW)
  const userEmail = await fetchUserEmail(cell.user_id).catch(() => null);
  if (userEmail) {
    fetch('https://dreamgrid.ink/api/send-cancellation-confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userEmail,
        dreamTitle: dream?.title || 'your dream',
        tierLabel: (cell.tier || '').toUpperCase(),
        price: cell.price,
        cancelledAt,
      }),
    }).catch((err) => console.error('Failed to send cancellation confirmation email:', err));
  }

  return res.status(200).json({ ok: true, cancelledAt });
}
