import { randomUUID, createHash } from 'node:crypto';
import { ensurePlatformSchema, resolvePlatformActor } from './platform.mjs';

const MAX_FILE = 2 * 1024 * 1024;
const MAX_WORKSPACE = 10 * 1024 * 1024;
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const json = (data, status=200) => Response.json(data, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const ready = new WeakMap();
export async function ensureManuscriptSchema(pool) {
 let promise=ready.get(pool);
 if(!promise){promise=pool.query(`CREATE TABLE IF NOT EXISTS stanaic_manuscript_files (
 id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES stanaic_platform_workspaces(id) ON DELETE CASCADE,
 submission_id text NOT NULL, version integer NOT NULL, original_name text NOT NULL,
 mime text NOT NULL, body bytea NOT NULL, size integer NOT NULL, checksum text NOT NULL,
 uploaded_by text NOT NULL, created_at bigint NOT NULL
 )`).catch(e=>{ready.delete(pool);throw e});ready.set(pool,promise)}return promise;
}
export function validateManuscriptFile(input) {
 if(!input||typeof input.name!=='string'||input.name.length>180||/[\x00-\x1f/\\]/.test(input.name))fail(400,'Use a simple filename with no directory path.');
 if(typeof input.base64!=='string'||input.base64.length>Math.ceil(MAX_FILE/3)*4||(input.base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64)))fail(400,'Supply a valid PDF or text file, no larger than 2 MB.');
 const bytes=Buffer.from(input.base64,'base64');if(!bytes.length||bytes.length>MAX_FILE)fail(413,'Files must contain between 1 byte and 2 MB.');
 const ext=input.name.split('.').pop()?.toLowerCase();let mime;
 if(ext==='pdf'&&bytes.subarray(0,5).toString()==='%PDF-'&&bytes.subarray(-2048).includes(Buffer.from('%%EOF'))){
  // Download only; no inline rendering or execution. This is not a malware scan.
  if(/\/(?:JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|RichMedia|Encrypt)\b/.test(bytes.toString('latin1')))fail(400,'Interactive, embedded or encrypted PDFs are not accepted. Upload a flattened anonymised PDF or UTF-8 text.');
  mime='application/pdf';
 }else if(ext==='txt'){
  try {new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{fail(400,'Text manuscripts must use UTF-8.');}
  if(bytes.includes(0))fail(400,'Binary content is not a text manuscript.');mime='text/plain; charset=utf-8';
 }else fail(400,'Only anonymised PDF and UTF-8 .txt manuscripts are supported.');
 if(input.anonymised!==true)fail(400,'Confirm that identifying names and metadata have been removed.');
 return {bytes,mime,name:input.name,size:bytes.length,checksum:createHash('sha256').update(bytes).digest('hex')};
}
function access(actor, submission) {
 const own=actor.demo?['author','learner'].includes(actor.role)&&submission.authorId==='demo-learner':submission.authorId===actor.actorId;
 const editorial=['superadmin','editor'].includes(actor.role);
 const assigned=actor.role==='reviewer'&&submission.reviewerIds.includes(actor.actorId);
 if(!own&&!editorial&&!assigned)fail(403,'This manuscript is outside your assigned access.');
 return {own,editorial,canUpload:own&&['author','learner','superadmin'].includes(actor.role)&&['submitted','revised','revision_requested'].includes(submission.status)};
}
/** @param {Request} request @param {any} pool @param {any} identity @param {Record<string,any>} env */
export async function handleManuscripts(request,pool,identity=null,env={}) {
 let client,transaction=false;
 try{
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\/platform\/files\/?/,'');
  if(!['GET','POST'].includes(request.method))fail(405,'Method not supported.');
  let body={};
  if(request.method==='POST'){
   if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')fail(403,'Upload from the manuscript workspace.');
   if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON is required.');
   const reader=request.body?.getReader();if(!reader)fail(400,'A file is required.');const chunks=[];let total=0;
   for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>3*1024*1024){await reader.cancel();fail(413,'The upload is too large.');}chunks.push(value);}
   try{body=JSON.parse(Buffer.concat(chunks).toString())}catch{fail(400,'Invalid upload data.');}
   if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Invalid upload data.');
  }
  await ensurePlatformSchema(pool);await ensureManuscriptSchema(pool);
  const mode=(request.method==='POST'?body.mode:url.searchParams.get('mode'))==='demo'?'demo':'live';
  const actor=await resolvePlatformActor(request,pool,identity,env,mode);
  client=await pool.connect();await client.query('BEGIN');transaction=true;
  const w=(await client.query('SELECT * FROM stanaic_platform_workspaces WHERE id=$1 FOR UPDATE',[actor.workspaceId])).rows[0];
  if(!w||w.demo!==actor.demo||(w.expires_at&&Number(w.expires_at)<Date.now()))fail(401,'The workspace is unavailable or expired.');
  const download=path.startsWith('download/');const fileId=download?path.slice(9):null;
  const file=fileId?(await client.query('SELECT * FROM stanaic_manuscript_files WHERE id=$1 AND workspace_id=$2',[fileId,actor.workspaceId])).rows[0]:null;
  if(download&&!file)fail(404,'Attachment not found.');
  const submissionId=download?file.submission_id:request.method==='POST'?body.submissionId:url.searchParams.get('submissionId');
  const submission=w.state.submissions.find(p=>p.id===submissionId);if(!submission)fail(404,'Submission not found.');
  const policy=access(actor,submission);
  if(path==='list'&&request.method==='GET'){
   const rows=(await client.query('SELECT id,version,original_name,mime,size,checksum,created_at FROM stanaic_manuscript_files WHERE workspace_id=$1 AND submission_id=$2 ORDER BY created_at DESC',[actor.workspaceId,submission.id])).rows;
   await client.query('COMMIT');transaction=false;
   return json({items:rows.map(r=>({id:r.id,version:r.version,name:policy.own||policy.editorial?r.original_name:`Anonymised manuscript v${r.version}`,mime:r.mime,size:r.size,checksum:r.checksum,createdAt:r.created_at})),canUpload:policy.canUpload,limitBytes:MAX_FILE,notice:'Private attachments. Files are not malware-scanned or automatically anonymised; remove identifying metadata before uploading.'});
  }
  if(download&&request.method==='GET'){
   await client.query('COMMIT');transaction=false;
   const extension=file.mime.startsWith('application/pdf')?'pdf':'txt';
   return new Response(new Uint8Array(file.body),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="manuscript-${file.id.slice(0,8)}-v${file.version}.${extension}"`,'Content-Length':String(file.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Referrer-Policy':'no-referrer'}});
  }
  if(path==='upload'&&request.method==='POST'){
   if(!policy.canUpload)fail(403,'Only the author may attach files before review or during a requested revision.');
   const valid=validateManuscriptFile(body);
   if(actor.demo){
    await client.query('SELECT pg_advisory_xact_lock(73104013)');
    const shared=(await client.query('SELECT COALESCE(sum(f.size),0) AS bytes FROM stanaic_manuscript_files f JOIN stanaic_platform_workspaces w ON w.id=f.workspace_id WHERE w.demo=true')).rows[0];
    if(Number(shared.bytes)+valid.size>50*1024*1024)fail(413,'Shared demonstration attachment capacity is full. Expired workspace cleanup frees this capacity.');
   }
   const usage=(await client.query('SELECT count(*) AS count,COALESCE(sum(size),0) AS bytes FROM stanaic_manuscript_files WHERE workspace_id=$1',[actor.workspaceId])).rows[0];
   if(Number(usage.count)>=30||Number(usage.bytes)+valid.size>MAX_WORKSPACE)fail(413,'This initial workspace supports 30 attachments totalling 10 MB.');
   const version=(submission.versions?.length||0)+1;
   const duplicate=(await client.query('SELECT id FROM stanaic_manuscript_files WHERE workspace_id=$1 AND submission_id=$2 AND version=$3 AND checksum=$4',[actor.workspaceId,submission.id,version,valid.checksum])).rows[0];
   if(duplicate){await client.query('COMMIT');transaction=false;return json({ok:true,id:duplicate.id,duplicate:true})}
   const id=randomUUID();await client.query('INSERT INTO stanaic_manuscript_files(id,workspace_id,submission_id,version,original_name,mime,body,size,checksum,uploaded_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,actor.workspaceId,submission.id,version,valid.name,valid.mime,valid.bytes,valid.size,valid.checksum,actor.actorId,Date.now()]);
   w.state.audit.unshift({id:randomUUID(),at:Date.now(),actorId:actor.actorId,role:actor.role,action:'manuscript.file_attached',target:submission.id,detail:`Private anonymised attachment added to version ${version}`});w.state.audit=w.state.audit.slice(0,1000);
   await client.query('UPDATE stanaic_platform_workspaces SET state=$1::jsonb WHERE id=$2',[JSON.stringify(w.state),actor.workspaceId]);await client.query('COMMIT');transaction=false;
   return json({ok:true,id,version,checksum:valid.checksum},201);
  }
  fail(404,'Attachment endpoint not found.');
 }catch(e){if(transaction)await client.query('ROLLBACK');return json({error:e.status?e.message:'Attachment storage is temporarily unavailable.'},e.status||503)}finally{client?.release()}
}
