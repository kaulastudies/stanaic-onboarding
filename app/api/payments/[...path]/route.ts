import { handlePayments } from '@/lib/payments.mjs';
import { getPool, ensureSchema } from '@/lib/database.mjs';
import { getAuth } from '@/lib/auth-server';
import { getPlatformOrder, setPlatformCheckoutSession, reservePlatformCheckoutAttempt, applyPaymentEvent, getPlatformRefund, setPlatformRefundPending, applyRefundEvent } from '@/lib/platform.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function route(request: Request) {
  try {
    const path = new URL(request.url).pathname;
    // Webhook authenticity comes only from the provider signature, not a browser
    // session. Status exposes setup names only; no secret values are returned.
    const needsIdentity = path.endsWith('/checkout') || path.endsWith('/refund');
    const identity = needsIdentity ? (await getAuth().getSession()).data?.user || null : null;
    if (!path.endsWith('/status')) await ensureSchema();
    return handlePayments(request, {
      pool: path.endsWith('/status') ? undefined : getPool(), identity, env: process.env,
      getOrder: getPlatformOrder,
      recordSession: setPlatformCheckoutSession,
      reserveCheckout: reservePlatformCheckoutAttempt,
      applyEvent: applyPaymentEvent,
      getRefund: getPlatformRefund,
      recordRefund: setPlatformRefundPending,
      applyRefundEvent,
    });
  } catch {
    return Response.json({ error: 'Payments are temporarily unavailable. The administrator should check the database, authentication and payment setup.' }, {status:503, headers:{'Cache-Control':'no-store'}});
  }
}
export const GET = route;
export const POST = route;
