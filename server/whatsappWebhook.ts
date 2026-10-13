import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Store } from './store';
import { dispatchMessages, parseMessageRef, recordDelivery, type DeliveryReport, type Senders } from './messaging';

type Env = Record<string, string | undefined>;

interface StatusUpdate {
  id?: string;
  status?: string;
  biz_opaque_callback_data?: string;
  errors?: { code?: number; title?: string; message?: string }[];
}

interface WebhookBody {
  entry?: { changes?: { field?: string; value?: { statuses?: StatusUpdate[] } }[] }[];
}

const STATUSES = new Set<DeliveryReport['status']>(['sent', 'delivered', 'read', 'failed']);

/** Meta signs each delivery with the app secret: `X-Hub-Signature-256: sha256=<hex HMAC of the raw body>`. */
export function validSignature(raw: string, header: string | null, appSecret: string): boolean {
  const given = header?.replace(/^sha256=/, '') ?? '';
  const expected = createHmac('sha256', appSecret).update(raw).digest('hex');
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Delivery reports grouped by business, from the reports' `ref` (set when sending). Reports without one aren't ours. */
export function reportsByBusiness(body: WebhookBody): Map<string, DeliveryReport[]> {
  const out = new Map<string, DeliveryReport[]>();
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      for (const s of change.value?.statuses ?? []) {
        const ref = parseMessageRef(s.biz_opaque_callback_data);
        const status = s.status as DeliveryReport['status'];
        if (!ref || !s.id || !STATUSES.has(status)) continue;
        const err = s.errors?.[0];
        const report: DeliveryReport = { messageId: ref.messageId, providerId: s.id, status, error: err ? `whatsapp ${err.code ?? ''} ${err.title ?? err.message ?? ''}`.trim() : undefined };
        out.set(ref.businessId, [...(out.get(ref.businessId) ?? []), report]);
      }
    }
  }
  return out;
}

/**
 * GET  /api/whatsapp/webhook: Meta's one-time check when the callback URL is saved (WHATSAPP_VERIFY_TOKEN).
 * POST /api/whatsapp/webhook: delivery reports, signed with WHATSAPP_APP_SECRET.
 * Without those settings the endpoint doesn't exist.
 */
export async function handleWhatsAppWebhook(req: Request, d: { store: Store; senders: Senders }, env: Env, waitUntil?: (p: Promise<unknown>) => void): Promise<Response> {
  const notFound = () => new Response('Not found', { status: 404 });
  if (req.method === 'GET') {
    const q = new URL(req.url).searchParams;
    const token = env.WHATSAPP_VERIFY_TOKEN;
    const given = q.get('hub.verify_token') ?? '';
    if (!token || q.get('hub.mode') !== 'subscribe' || given.length !== token.length || !timingSafeEqual(Buffer.from(given), Buffer.from(token))) return notFound();
    return new Response(q.get('hub.challenge') ?? '', { headers: { 'content-type': 'text/plain' } });
  }
  const secret = env.WHATSAPP_APP_SECRET;
  if (req.method !== 'POST' || !secret) return notFound();
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get('x-hub-signature-256'), secret)) return new Response('Bad signature', { status: 401 });
  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const resend: string[] = [];
  for (const [businessId, reports] of reportsByBusiness(body)) {
    if (await recordDelivery(d.store, d.senders, businessId, reports)) resend.push(businessId);
  }
  if (resend.length) {
    const work = dispatchMessages(d.store, d.senders, { only: resend, origin: env.SITE_URL ?? new URL(req.url).origin }).catch((e) => console.error('[messages]', e));
    if (waitUntil) waitUntil(work);
    else await work;
  }
  return new Response('ok');
}
