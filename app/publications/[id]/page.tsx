import { notFound } from 'next/navigation';
import { ensureSchema, getPool } from '@/lib/database.mjs';
import { ensurePlatformSchema } from '@/lib/platform.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export default async function Publication({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;
 if(!/^[a-f0-9-]{36}$/.test(id))notFound();
 let paper;
 try {
  await ensureSchema();const pool=getPool();await ensurePlatformSchema(pool);
  const row=(await pool.query("SELECT state FROM stanaic_platform_workspaces WHERE id='institution-live' AND demo=false")).rows[0];
  paper=row?.state?.submissions?.find((p:Record<string,unknown>)=>p.id===id&&p.status==='published'&&p.proofApproved===true);
 } catch { notFound(); }
 if(!paper)notFound();
 return <main style={{maxWidth:850,margin:'48px auto',padding:'0 25px 80px'}}><a href="/institutional/journal.html">← Journal of AI Governance and Assurance</a><p style={{marginTop:40,fontSize:12,letterSpacing:2}}>STANAIC / PUBLISHED RESEARCH</p><h1 style={{fontFamily:'Georgia,serif',fontSize:'clamp(32px,5vw,54px)',lineHeight:1.15,margin:'20px 0'}}>{paper.title}</h1><p>{paper.authorName} · {new Date(paper.publishedAt).toLocaleDateString('en-IN')}</p><p style={{fontSize:12}}>Licence: {paper.licence}</p><section style={{marginTop:35,padding:'25px',background:'#f0f2e9'}}><h2>Abstract</h2><p style={{whiteSpace:'pre-wrap',lineHeight:1.9}}>{paper.abstract}</p></section><article style={{whiteSpace:'pre-wrap',lineHeight:1.95,fontSize:16,marginTop:40}}>{paper.manuscript}</article><footer style={{borderTop:'1px solid #ddd',marginTop:40,paddingTop:20,fontSize:12}}>Publication record {paper.id}. No DOI, indexing status or external accreditation is implied.</footer></main>;
}
