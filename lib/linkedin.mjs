import { randomUUID } from 'node:crypto';

const PNG = Buffer.from([137,80,78,71,13,10,26,10]);
const MAX_IMAGE = 3 * 1024 * 1024;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const clean = (value, label, max, required = true) => {
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(400, `Check ${label}.`);
  return value.trim();
};
export function linkedinProfile(value = '') {
  if (!value) return '';
  let u; try { u = new URL(value); } catch { fail(400, 'Enter a full LinkedIn profile URL.'); }
  if (u.protocol !== 'https:' || !['linkedin.com','www.linkedin.com'].includes(u.hostname) || !/^\/in\/[^/]+\/?$/.test(u.pathname) || u.username || u.password) fail(400, 'Use an https://www.linkedin.com/in/… profile URL.');
  u.search = ''; u.hash = ''; return u.toString();
}
export function integrationStatus(env = {}) {
  const missing = ['LINKEDIN_ACCESS_TOKEN','LINKEDIN_AUTHOR_URN','LINKEDIN_VERSION'].filter(k => !env[k]);
  const author = env.LINKEDIN_AUTHOR_URN || '';
  const valid = /^urn:li:(person|organization):[A-Za-z0-9_-]+$/.test(author) && /^20\d{4}$/.test(env.LINKEDIN_VERSION || '');
  return { configured: !missing.length && valid, missing, authorUrn: author, destination: author.startsWith('urn:li:organization:') ? 'corporate' : 'personal', note: missing.length ? 'LinkedIn API connection is not configured. Image and text exports still work.' : valid ? 'Server connection configured; LinkedIn permissions and token validity are checked when publishing.' : 'LinkedIn author URN or API version is invalid.' };
}
export function announcementText({ name, designation, summary = '', profileUrl = '', voice = 'corporate' }) {
  name = clean(name, 'name', 120); designation = clean(designation, 'designation', 100);
  summary = clean(summary, 'summary', 900, false); profileUrl = linkedinProfile(profileUrl);
  const intro = voice === 'personal' ? `I’m pleased to welcome ${name} to STANAIC as ${designation}.` : `STANAIC welcomes ${name} as ${designation}.`;
  return `Official announcement\n\n${intro}\n\n${summary || 'We look forward to working together on responsible AI practice, professional exchange and evidence-based research.'}${profileUrl ? `\n\nMember profile: ${profileUrl}` : ''}\n\nSTANAIC · International Artificial Intelligence Committee\nhttps://stanaic.org/`;
}
export function validatePng(data) {
  if (typeof data !== 'string' || !data.startsWith('data:image/png;base64,') || data.length > Math.ceil(MAX_IMAGE * 4 / 3) + 100) fail(400, 'Provide a PNG announcement image of at most 3 MB.');
  const b64 = data.slice(22); if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) fail(400, 'PNG data is invalid.');
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length < 33 || bytes.length > MAX_IMAGE || !bytes.subarray(0,8).equals(PNG) || bytes.toString('ascii',12,16) !== 'IHDR') fail(400, 'The file is not a valid PNG image.');
  const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20);
  if (!w || !h || w*h >= 36152320) fail(400, 'The PNG dimensions exceed LinkedIn image limits.');
  return bytes;
}
export function mentionCommentary(text, name, urn) {
  if (!urn) return text;
  if (!/^urn:li:person:[A-Za-z0-9_-]+$/.test(urn)) fail(400, 'Enter an API Person URN obtained through an authorised LinkedIn integration.');
  if (!text.includes(name)) fail(400, 'The announcement must contain the member’s exact approved name for tagging.');
  // Escape little-text metacharacters in the name so a name cannot inject another mention.
  const label = name.replace(/[\\|{}@\[\]()<>#*_~]/g, c => `\\${c}`);
  return text.replace(name, `@[${label}](${urn})`);
}
function headers(env) { return { Authorization: `Bearer ${env.LINKEDIN_ACCESS_TOKEN}`, 'Content-Type':'application/json', 'Linkedin-Version':env.LINKEDIN_VERSION, 'X-Restli-Protocol-Version':'2.0.0' }; }
function providerError(response, stage) { return Object.assign(new Error(`LinkedIn ${stage} returned ${response.status}. Check the connected account’s permissions and provider logs.`), { status: 502, providerStatus: response.status }); }
export async function uploadLinkedInImage(env, bytes, fetcher = fetch) {
  const r = await fetcher('https://api.linkedin.com/rest/images?action=initializeUpload', { method:'POST', headers:headers(env), signal:AbortSignal.timeout(15000), body:JSON.stringify({initializeUploadRequest:{owner:env.LINKEDIN_AUTHOR_URN}}) });
  if (!r.ok) throw providerError(r, 'image registration');
  const { value } = await r.json();
  if (!/^urn:li:image:[A-Za-z0-9_-]+$/.test(value?.image || '')) fail(502, 'LinkedIn returned an invalid image reference.');
  let url; try { url = new URL(value.uploadUrl); } catch { fail(502, 'LinkedIn did not return an image upload URL.'); }
  // The signed upload URL is issued by LinkedIn, never supplied by a browser.
  if (url.protocol !== 'https:' || !(url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com') || url.hostname.endsWith('.licdn.com'))) fail(502, 'LinkedIn returned an unexpected upload host.');
  const uploaded = await fetcher(url.toString(), { method:'PUT', headers:{Authorization:`Bearer ${env.LINKEDIN_ACCESS_TOKEN}`,'Content-Type':'image/png'}, signal:AbortSignal.timeout(20000), body:bytes });
  if (!uploaded.ok) throw providerError(uploaded, 'image upload');
  return value.image;
}
export async function imageReadiness(env, image, fetcher = fetch) {
  const r = await fetcher(`https://api.linkedin.com/rest/images/${encodeURIComponent(image)}`, { headers:headers(env), signal:AbortSignal.timeout(15000) });
  if (!r.ok) throw providerError(r, 'image status check');
  const data = await r.json();
  if (data.status === 'PROCESSING_FAILED') fail(502, 'LinkedIn could not process the announcement image.');
  return data.status === 'AVAILABLE';
}
export async function createLinkedInPost(env, row, fetcher = fetch) {
  const commentary = mentionCommentary(row.body, row.name, row.mention_urn);
  const r = await fetcher('https://api.linkedin.com/rest/posts', { method:'POST', headers:headers(env), signal:AbortSignal.timeout(20000), body:JSON.stringify({ author:env.LINKEDIN_AUTHOR_URN, commentary, visibility:'PUBLIC', distribution:{feedDistribution:'MAIN_FEED',targetEntities:[],thirdPartyDistributionChannels:[]}, content:{media:{id:row.image_urn,title:`Welcome ${row.name} — ${row.designation}`}}, lifecycleState:'PUBLISHED', isReshareDisabledByAuthor:false }) });
  const urn = r.headers.get('x-restli-id');
  if (r.status === 201 && /^urn:li:(share|ugcPost):[0-9]+$/.test(urn || '')) return { urn, url:`https://www.linkedin.com/feed/update/${urn}/` };
  const error = providerError(r, 'post creation');
  error.uncertain = r.status >= 500 || r.ok; throw error;
}

let ready;
export async function ensureSocialSchema(pool) {
  ready ??= pool.query(`CREATE TABLE IF NOT EXISTS platform_social_announcements (
    id text PRIMARY KEY, request_key text NOT NULL UNIQUE, member_id text NOT NULL,
    actor_id text NOT NULL, author_urn text NOT NULL, voice text NOT NULL, name text NOT NULL,
    designation text NOT NULL, body text NOT NULL, profile_url text NOT NULL DEFAULT '', mention_urn text NOT NULL DEFAULT '',
    image_base64 text NOT NULL, image_urn text, status text NOT NULL DEFAULT 'approved',
    public_approved boolean NOT NULL DEFAULT false, consent_record jsonb NOT NULL,
    provider_post_urn text, provider_post_url text, error text,
    created_at bigint NOT NULL, updated_at bigint NOT NULL,
    UNIQUE(member_id,author_urn)
  )`).catch(error => { ready = undefined; throw error; });
  await ready;
}
const json = (data, status = 200) => Response.json(data, {status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export function requirePublisher(actor) { if (!actor?.id || !['owner','admin'].includes(actor.role)) fail(403,'Only an authorised secretariat administrator may approve or publish announcements.'); }
export function publicAnnouncement(row) {
  return { id:row.id, name:row.name, designation:row.designation, body:row.body, profileUrl:row.profile_url, createdAt:row.created_at, status:row.status, postUrl:row.provider_post_url || null };
}
function sourceSnapshotMatches(row) {
  let p={};try{p=JSON.parse(row.source_profile||'{}')}catch{}
  return row.name === (p.name||row.source_name) && row.designation === row.source_designation;
}
export async function getPublicAnnouncement(pool, id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const r = await pool.query(`SELECT a.*,i.name AS source_name,i.designation AS source_designation,i.profile AS source_profile FROM platform_social_announcements a JOIN invitations i ON i.id=a.member_id WHERE a.id=$1 AND a.public_approved=true AND i.status='approved'`,[id]);
  return r.rows[0] && sourceSnapshotMatches(r.rows[0]) ? r.rows[0] : null;
}
export async function handleSocial(request, {pool, actor, env = {}, fetcher = fetch}) {
  try {
    const u = new URL(request.url), path = u.pathname.replace(/^\/api\/social\//,'');
    if (request.method === 'GET' && path.startsWith('public/')) {
      const [_,id,image] = path.split('/'); const row = await getPublicAnnouncement(pool,id);
      if (!row) return json({error:'Announcement not found.'},404);
      if (image === 'image') return new Response(Buffer.from(row.image_base64,'base64'),{headers:{'Content-Type':'image/png','Cache-Control':'public,max-age=300','X-Content-Type-Options':'nosniff'}});
      return json(publicAnnouncement(row));
    }
    requirePublisher(actor);
    if (request.method === 'GET' && path === 'status') return json(integrationStatus(env));
    if (request.method === 'GET' && path === 'members') {
      const r = await pool.query(`SELECT id,name,designation,profile FROM invitations WHERE status='approved' ORDER BY reviewed_at DESC LIMIT 500`);
      return json({members:r.rows.map(m=>{let p={};try{p=JSON.parse(m.profile||'{}')}catch{}return {id:m.id,name:p.name||m.name,designation:m.designation,bio:p.bio||'',expertise:p.expertise||''}})});
    }
    if (request.method === 'GET' && path === 'announcements') {
      const r = await pool.query('SELECT id,name,designation,status,error,provider_post_url,created_at FROM platform_social_announcements ORDER BY created_at DESC LIMIT 100');return json({announcements:r.rows});
    }
    if (request.method !== 'POST') return json({error:'Not found.'},404);
    if (request.headers.get('origin') !== u.origin || request.headers.get('sec-fetch-site') === 'cross-site') fail(403,'Submit this action from the STANAIC portal.');
    const length = Number(request.headers.get('content-length') || 0);if(length>4300000)fail(413,'The announcement package is too large.');
    const raw = await request.text(); if(raw.length>4300000)fail(413,'The announcement package is too large.');
    let b;try{b=JSON.parse(raw)}catch{fail(400,'Send a valid JSON announcement package.');}
    if(path === 'approve') {
      const memberId=clean(b.memberId,'approved member',100), requestKey=clean(b.requestKey,'request key',100);
      const existing=await pool.query('SELECT * FROM platform_social_announcements WHERE request_key=$1',[`${actor.id}:${requestKey}`]);
      if(existing.rows[0])return json({announcement:publicAnnouncement(existing.rows[0]),duplicate:true});
      const result=await pool.query("SELECT * FROM invitations WHERE id=$1 AND status='approved'",[memberId]);const member=result.rows[0];
      if(!member)fail(409,'Select an approved membership record. Draft or sample members cannot be published.');
      const text=clean(b.text,'announcement text',3000);const profile=linkedinProfile(b.profileUrl||'');
      const voice=['corporate','personal'].includes(b.voice)?b.voice:'corporate';const config=integrationStatus(env);
      if(config.configured && config.destination!==voice)fail(409,'The selected voice does not match the configured LinkedIn author.');
      let p={};try{p=JSON.parse(member.profile||'{}')}catch{}const name=p.name||member.name;
      if(!text.includes(name)||!text.includes(member.designation))fail(400,'Include the approved name and designation in the announcement.');
      if(b.publicityConsent!==true)fail(400,'Record the member’s explicit consent for public announcement, image and LinkedIn mention.');
      const reference=clean(b.consentReference,'publicity consent reference',500);
      const urn=b.mentionUrn?clean(b.mentionUrn,'LinkedIn Person URN',150):'';
      if(urn && b.mentionConfirmed!==true)fail(400,'Confirm that the API Person URN belongs to the selected member.');
      mentionCommentary(text,name,urn);const image=validatePng(b.imageData);
      let id=randomUUID();const now=Date.now();const author=config.authorUrn||`unconfigured:${voice}`;
      const previous=(await pool.query('SELECT * FROM platform_social_announcements WHERE member_id=$1 AND author_urn=$2',[memberId,author])).rows[0];
      if(previous){
        if(['published','publishing','uncertain','uploading'].includes(previous.status))fail(409,'This member already has a published or in-flight announcement for this author. Reconcile the existing record before creating another.');
        id=previous.id;
      }
      const r=await pool.query(`INSERT INTO platform_social_announcements(id,request_key,member_id,actor_id,author_urn,voice,name,designation,body,profile_url,mention_urn,image_base64,public_approved,consent_record,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13,$14,$14) ON CONFLICT(member_id,author_urn) DO UPDATE SET request_key=EXCLUDED.request_key,actor_id=EXCLUDED.actor_id,voice=EXCLUDED.voice,name=EXCLUDED.name,designation=EXCLUDED.designation,body=EXCLUDED.body,profile_url=EXCLUDED.profile_url,mention_urn=EXCLUDED.mention_urn,image_base64=EXCLUDED.image_base64,image_urn=NULL,status='approved',public_approved=true,consent_record=EXCLUDED.consent_record,error=NULL,updated_at=EXCLUDED.updated_at WHERE platform_social_announcements.status IN ('approved','image_pending','upload_failed','rejected') RETURNING *`,[id,`${actor.id}:${requestKey}`,memberId,actor.id,author,voice,name,member.designation,text,profile,urn,image.toString('base64'),JSON.stringify({attestedBy:actor.id,attestedAt:now,reference,scope:'Public announcement text, supplied image and LinkedIn mention; staff attestation of member consent'}),now]);
      if(!r.rows[0])fail(409,'An announcement already exists for this member and destination. Open the existing record to avoid duplicates.');
      await pool.query('INSERT INTO audit(id,actor,action,target,created_at) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor.id,previous?'announcement.reapproved':'announcement.approved',id,now]);
      return json({announcement:publicAnnouncement(r.rows[0])},201);
    }
    if(path === 'publish') {
      const id=clean(b.id,'announcement ID',100);let row=(await pool.query('SELECT a.*,i.name AS source_name,i.designation AS source_designation,i.profile AS source_profile FROM platform_social_announcements a JOIN invitations i ON i.id=a.member_id WHERE a.id=$1 AND i.status=\'approved\'',[id])).rows[0];
      if(!row||!row.public_approved)fail(404,'Approved announcement not found.');
      if(!sourceSnapshotMatches(row))fail(409,'The member’s approved name or designation has changed. Regenerate and reapprove the announcement from the current membership record.');
      if(row.status==='published')return json({announcement:publicAnnouncement(row),duplicate:true});
      const config=integrationStatus(env);if(!config.configured)fail(503,config.note);
      if(row.voice!==config.destination)fail(409,'The configured LinkedIn account does not match this announcement’s destination.');
      if(!row.author_urn.startsWith('unconfigured:')&&row.author_urn!==config.authorUrn)fail(409,'This package was approved for a different LinkedIn author.');
      if(['publishing','uncertain','uploading','rejected'].includes(row.status))fail(409,`Announcement status is ${row.status}. Reconcile the provider result before another attempt.`);
      if(!row.image_urn) {
        const claim=await pool.query("UPDATE platform_social_announcements SET status='uploading',author_urn=$2,error=NULL,updated_at=$3 WHERE id=$1 AND status IN ('approved','upload_failed') RETURNING *",[id,config.authorUrn,Date.now()]);
        if(!claim.rows[0])fail(409,'Another publication request is already handling this announcement.');
        try { const image=await uploadLinkedInImage(env,Buffer.from(row.image_base64,'base64'),fetcher);row=(await pool.query("UPDATE platform_social_announcements SET image_urn=$2,status='image_pending',updated_at=$3 WHERE id=$1 RETURNING *",[id,image,Date.now()])).rows[0]; }
        catch(error){await pool.query("UPDATE platform_social_announcements SET status='upload_failed',error=$2,updated_at=$3 WHERE id=$1",[id,error.message,Date.now()]);throw error;}
      }
      let available;try{available=await imageReadiness(env,row.image_urn,fetcher)}catch(error){await pool.query('UPDATE platform_social_announcements SET error=$2,updated_at=$3 WHERE id=$1',[id,error.message,Date.now()]);throw error;}
      if(!available)return json({pending:true,message:'LinkedIn is processing the image. Use Check image & publish again; no post has been created.',announcement:publicAnnouncement(row)},202);
      const claimed=await pool.query("UPDATE platform_social_announcements SET status='publishing',error=NULL,updated_at=$2 WHERE id=$1 AND status='image_pending' RETURNING *",[id,Date.now()]);
      if(!claimed.rows[0])fail(409,'Another publication request is already handling this announcement.');
      try {
        const posted=await createLinkedInPost(env,claimed.rows[0],fetcher);
        row=(await pool.query("UPDATE platform_social_announcements SET status='published',provider_post_urn=$2,provider_post_url=$3,updated_at=$4 WHERE id=$1 RETURNING *",[id,posted.urn,posted.url,Date.now()])).rows[0];
        await pool.query('INSERT INTO audit(id,actor,action,target,created_at) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor.id,'announcement.linkedin.published',id,Date.now()]);
        return json({announcement:publicAnnouncement(row)});
      }catch(error){const uncertain=error.uncertain!==false && (!error.providerStatus || error.providerStatus>=500 || error.uncertain);await pool.query('UPDATE platform_social_announcements SET status=$2,error=$3,updated_at=$4 WHERE id=$1',[id,uncertain?'uncertain':'rejected',uncertain?'The post result is uncertain. Check LinkedIn before any retry.':error.message,Date.now()]);throw error;}
    }
    return json({error:'Not found.'},404);
  }catch(error){return json({error:error.status?error.message:'The announcement service is temporarily unavailable.'},error.status||503)}
}
