import { answerQuestion, assistantStatus } from '@/lib/assistant.mjs';
import { handle } from '@/lib/onboarding.mjs';
import { database, ensureSchema, getPool } from '@/lib/database.mjs';
import { getAuth } from '@/lib/auth-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json(assistantStatus(process.env), { headers: { 'Cache-Control': 'no-store' } }); }
export async function POST(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') return Response.json({error:'Use this portal to ask a question.'},{status:403});
    if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({error:'JSON is required.'},{status:415});
    const body = await request.text();
    if (body.length > 5000) return Response.json({error:'The question is too large.'},{status:413});
    let input;
    try { input = JSON.parse(body); } catch { return Response.json({error:'Check the question format.'},{status:400}); }
    const answer = await answerQuestion(input, {
      env: process.env,
      authorize: async () => {
        await ensureSchema();
        const session = (await getAuth().getSession()).data;
        const response = await handle(new Request(`${origin}/api/admin/dashboard`), { ...process.env, DB: database(), identity: session?.user || null });
        if (!response || !response.ok) throw Object.assign(new Error('Verified staff access is required for model assistance.'), {status:response?.status || 503});
        return {id: session!.user!.id};
      },
      consumeQuota: async (id: string) => {
        const now = Date.now(), key = `assistant:${id}:${Math.floor(now / 86400000)}`;
        const result = await getPool().query('INSERT INTO limits(key,count,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=limits.count+1 RETURNING count', [key, now + 86400000]);
        if (Number(result.rows[0].count) > 20) throw Object.assign(new Error('The daily limit of 20 model requests has been reached. The public source guide remains available.'), {status:429});
      },
    });
    return Response.json(answer,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  } catch (error) {
    const e = error as Error & {status?:number};
    const known = typeof e.status === 'number';
    return Response.json({error:known ? e.message : 'Model assistance is temporarily unavailable. Please use the public source guide.'},{status:known ? e.status : 503,headers:{'Cache-Control':'no-store'}});
  }
}
