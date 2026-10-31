import { handleNotifications } from '@/lib/notifications.mjs';
import { ensureSchema, getPool } from '@/lib/database.mjs';
import { getAuth } from '@/lib/auth-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
async function route(request: Request) {
  try {
    await ensureSchema();
    const url = new URL(request.url);
    let identity = null;
    if (!url.pathname.endsWith('/cron') && url.searchParams.get('mode') !== 'demo') {
      try { identity = (await getAuth().getSession()).data?.user || null; } catch { /* handler rejects live access without verified identity */ }
    }
    return handleNotifications(request, getPool(), identity, process.env);
  } catch {
    return Response.json({ error: 'Notification storage is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
export const GET = route;
export const POST = route;
