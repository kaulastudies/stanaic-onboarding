import { getPool, database, ensureSchema } from '@/lib/database.mjs';
import { handle } from '@/lib/onboarding.mjs';
import { ensureSocialSchema, handleSocial } from '@/lib/linkedin.mjs';
import { getAuth } from '@/lib/auth-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function route(request: Request) {
  try {
    await ensureSchema(); const pool = getPool(); await ensureSocialSchema(pool);
    const path = new URL(request.url).pathname;
    let actor = null;
    if (!path.startsWith('/api/social/public/')) {
      const session = (await getAuth().getSession()).data;
      const check = await handle(new Request(`${new URL(request.url).origin}/api/admin/dashboard`), { ...process.env, DB: database(), identity: session?.user || null });
      if (!check) return Response.json({error:'Staff authorisation is unavailable.'},{status:503});
      if (!check.ok) return check;
      actor = (await check.json()).user;
    }
    return handleSocial(request, { pool, actor, env: process.env });
  } catch {
    return Response.json({ error: 'Live announcements require a configured database and staff sign-in. The sample image and text editor remains available.' }, {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
export const GET = route;
export const POST = route;
