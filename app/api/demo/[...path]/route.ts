import { handleDemo } from '@/lib/demo.mjs';
import { ensureSchema, getPool } from '@/lib/database.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function route(request: Request) {
  try {
    await ensureSchema();
    return handleDemo(request, getPool(), request.headers.get('x-vercel-forwarded-for') || 'unknown');
  } catch {
    return Response.json({ error: 'The demo is temporarily unavailable. Please try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
export const GET = route;
export const POST = route;
