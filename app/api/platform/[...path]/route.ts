import { handlePlatform } from '@/lib/platform.mjs';
import { ensureSchema, getPool } from '@/lib/database.mjs';
import { getAuth } from '@/lib/auth-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function route(request: Request) {
  try {
    await ensureSchema();
    const url = new URL(request.url);
    const isDemo = url.pathname.includes('/demo/') || url.searchParams.get('mode') === 'demo';
    // Public registry and demo endpoints do not require a Neon session. Mutations
    // still require the platform's own opaque workspace session and origin check.
    let identity = null;
    if (!isDemo && !url.pathname.includes('/verify/') && !url.pathname.endsWith('/catalogue')) {
      try { identity = (await getAuth().getSession()).data?.user || null; } catch { /* handlePlatform fails live access closed. */ }
    }
    return handlePlatform(request, getPool(), identity, { ...process.env, clientIp: request.headers.get('x-vercel-forwarded-for') || 'unknown' });
  } catch {
    return Response.json({ error: 'Platform database configuration is incomplete or temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
export const GET = route;
export const POST = route;
