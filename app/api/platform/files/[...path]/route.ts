import { handleManuscripts } from '@/lib/manuscripts.mjs';
import { ensureSchema, getPool } from '@/lib/database.mjs';
import { getAuth } from '@/lib/auth-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function route(request:Request){
 try{
  await ensureSchema();let identity=null;
  try{identity=(await getAuth().getSession()).data?.user||null}catch{}
  return handleManuscripts(request,getPool(),identity,process.env);
 }catch{return Response.json({error:'Attachment storage is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
export const GET=route;
export const POST=route;
