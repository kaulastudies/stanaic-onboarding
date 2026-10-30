import { getAuth } from '@/lib/auth-server';
import { database, ensureSchema } from '@/lib/database.mjs';
import type { NextRequest } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
async function route(request: NextRequest, context: Context) {
  try {
    const { path } = await context.params;
    const endpoint = path.join('/');
    const allowed = request.method === 'GET' ? ['get-session'] : ['email-otp/send-verification-otp', 'sign-in/email-otp', 'sign-out'];
    if (!allowed.includes(endpoint)) return Response.json({ error: 'Not found' }, { status: 404 });
    if (request.method === 'POST') {
      if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ message: 'Use this portal to sign in.' }, { status: 403 });
      if (endpoint !== 'sign-out') {
        const raw = await request.clone().text();
        if (raw.length > 2000) return Response.json({ message: 'Request is too large.' }, { status: 413 });
        const body = JSON.parse(raw);
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        await ensureSchema();
        const staff = email !== process.env.OWNER_EMAIL?.toLowerCase() ? await database().prepare('SELECT id FROM staff WHERE email=?').bind(email).first() : true;
        if (!staff) return Response.json({ message: 'Use the email address approved by your administrator.' }, { status: 403 });
        if (endpoint === 'email-otp/send-verification-otp' && body.type !== 'sign-in') return Response.json({ message: 'Unsupported request.' }, { status: 400 });
      }
    }
    const handlers = getAuth().handler();
    return request.method === 'GET' ? handlers.GET(request, context) : handlers.POST(request, context);
  } catch {
    return Response.json({ message: 'Sign-in is temporarily unavailable. Please contact the administrator.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
export const GET = route;
export const POST = route;
