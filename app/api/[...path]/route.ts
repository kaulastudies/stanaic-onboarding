import { handle } from '@/lib/onboarding.mjs';
import { database, ensureSchema } from '@/lib/database.mjs';
import { getAuth } from '@/lib/auth-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function route(request: Request) {
  try {
    await ensureSchema();
    const path = new URL(request.url).pathname;
    const session = path.startsWith('/api/admin/') || path === '/api/session' ? (await getAuth().getSession()).data : null;
    return handle(request, { ...process.env, DB: database(), identity: session?.user || null, clientIp: request.headers.get('x-vercel-forwarded-for') || 'unknown' });
  } catch {
    return Response.json({ error: 'Portal configuration is incomplete or temporarily unavailable. Please contact the administrator.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
export const GET = route;
export const POST = route;
