import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { announcementText,linkedinProfile,integrationStatus,validatePng,mentionCommentary,requirePublisher,uploadLinkedInImage,imageReadiness,createLinkedInPost,ensureSocialSchema,handleSocial,getPublicAnnouncement } from '../lib/linkedin.mjs';

const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlSAAAAAASUVORK5CYII=';
const env={LINKEDIN_ACCESS_TOKEN:'test-token-never-live',LINKEDIN_AUTHOR_URN:'urn:li:organization:123',LINKEDIN_VERSION:'202606'};
const actor={id:'staff-1',role:'admin'};
function mock(){const calls=[];return {calls,fetch:async(url,options={})=>{calls.push([String(url),options]);if(String(url).includes('initializeUpload'))return Response.json({value:{image:'urn:li:image:test123',uploadUrl:'https://www.linkedin.com/dms-uploads/test'}});if(String(url).includes('dms-uploads'))return new Response(null,{status:201});if(String(url).includes('/images/'))return Response.json({status:'AVAILABLE'});if(String(url).endsWith('/posts'))return new Response(null,{status:201,headers:{'x-restli-id':'urn:li:share:123456'}});throw Error('Unexpected mocked request');}}}

test('template includes only supplied approved facts and valid profile',()=>{const text=announcementText({name:'Alex Morgan',designation:'Research Fellow',summary:'Works on evaluation reproducibility.',profileUrl:'https://www.linkedin.com/in/alex/?tracking=x'});assert.match(text,/STANAIC welcomes Alex Morgan as Research Fellow/);assert.match(text,/Works on evaluation reproducibility/);assert.doesNotMatch(text,/tracking/);assert.throws(()=>linkedinProfile('https://linkedin.com.evil.test/in/alex'));assert.throws(()=>linkedinProfile('https://www.linkedin.com/company/alex'))});
test('connection readiness never reveals tokens and missing config fails closed',()=>{assert.equal(integrationStatus({}).configured,false);assert.equal(integrationStatus(env).configured,true);assert.equal(JSON.stringify(integrationStatus(env)).includes('test-token'),false);assert.equal(integrationStatus({...env,LINKEDIN_AUTHOR_URN:'https://www.linkedin.com/in/foo'}).configured,false)});
test('only secretariat publishers can save or post announcements',()=>{assert.throws(()=>requirePublisher(null));assert.throws(()=>requirePublisher({id:'viewer',role:'viewer'}));assert.throws(()=>requirePublisher({id:'maintainer',role:'maintainer'}));assert.doesNotThrow(()=>requirePublisher(actor))});
test('PNG validation rejects fake headers and oversize payloads',()=>{assert.equal(validatePng(image).readUInt32BE(16),1);assert.throws(()=>validatePng('data:image/png;base64,aGVsbG8='));assert.throws(()=>validatePng('data:image/svg+xml;base64,PHN2Zz4='));assert.throws(()=>validatePng('data:image/png;base64,'+'A'.repeat(4300000)))});
test('mentions require an API Person URN and canonical name',()=>{assert.match(mentionCommentary('Welcome Alex Morgan','Alex Morgan','urn:li:person:abc_123'),/@\[Alex Morgan\]\(urn:li:person:abc_123\)/);assert.throws(()=>mentionCommentary('Welcome Alex','Alex Morgan','urn:li:person:abc'));assert.throws(()=>mentionCommentary('Welcome Alex','Alex','https://www.linkedin.com/in/alex'))});
test('image upload and post use provider-issued asset and supported mention schema',async()=>{const m=mock();const urn=await uploadLinkedInImage(env,validatePng(image),m.fetch);assert.equal(urn,'urn:li:image:test123');assert.equal(await imageReadiness(env,urn,m.fetch),true);const post=await createLinkedInPost(env,{body:'Welcome Alex Morgan',name:'Alex Morgan',designation:'Research Fellow',mention_urn:'urn:li:person:alex',image_urn:urn},m.fetch);assert.equal(post.url,'https://www.linkedin.com/feed/update/urn:li:share:123456/');const payload=JSON.parse(m.calls[3][1].body);assert.equal(payload.content.media.id,urn);assert.match(payload.commentary,/@\[Alex Morgan\]/);assert.equal(m.calls[0][1].headers['Linkedin-Version'],'202606')});
test('pending image is not treated as available; post timeout is not success',async()=>{assert.equal(await imageReadiness(env,'urn:li:image:x',async()=>Response.json({status:'PROCESSING'})),false);await assert.rejects(createLinkedInPost(env,{body:'Welcome Alex',name:'Alex',image_urn:'urn:li:image:x'},async()=>new Response(null,{status:503})),e=>e.uncertain===true);await assert.rejects(uploadLinkedInImage(env,validatePng(image),async()=>Response.json({value:{image:'urn:li:image:x',uploadUrl:'https://evil.test/upload'}})))});

test('durable lifecycle enforces approved member, publicity consent, idempotency and no duplicate post',async()=>{
 const db=new PGlite();await db.exec(`CREATE TABLE invitations(id text primary key,name text,designation text,status text,profile text,reviewed_at bigint);CREATE TABLE audit(id text primary key,actor text,action text,target text,created_at bigint);INSERT INTO invitations VALUES('member-1','Alex Morgan','Research Fellow','approved','{}',1),('member-2','Pending Member','Fellow','submitted','{}',1);`);const pool={query:(sql,values)=>db.query(sql,values)};await ensureSocialSchema(pool);const m=mock();
 const request=(path,data)=>new Request('https://stanaic.test/api/social/'+path,{method:'POST',headers:{origin:'https://stanaic.test','Content-Type':'application/json'},body:JSON.stringify(data)});
 const body={memberId:'member-1',requestKey:'one',text:'STANAIC welcomes Alex Morgan as Research Fellow.',profileUrl:'',voice:'corporate',imageData:image,publicityConsent:true,consentReference:'Internal permission record 001'};
 let r=await handleSocial(request('approve',body),{pool,env,fetcher:m.fetch});assert.equal(r.status,403);
 r=await handleSocial(request('approve',{...body,memberId:'member-2'}),{pool,actor,env,fetcher:m.fetch});assert.equal(r.status,409);
 r=await handleSocial(request('approve',{...body,publicityConsent:false}),{pool,actor,env,fetcher:m.fetch});assert.equal(r.status,400);
 r=await handleSocial(request('approve',body),{pool,actor,env,fetcher:m.fetch});assert.equal(r.status,201);const first=(await r.json()).announcement;
 r=await handleSocial(request('approve',body),{pool,actor,env,fetcher:m.fetch});assert.equal((await r.json()).duplicate,true);
 assert.equal((await getPublicAnnouncement(pool,first.id)).name,'Alex Morgan');
 await db.query("UPDATE invitations SET designation='Senior Fellow' WHERE id='member-1'");
 assert.equal(await getPublicAnnouncement(pool,first.id),null);
 r=await handleSocial(request('publish',{id:first.id}),{pool,actor,env,fetcher:m.fetch});assert.equal(r.status,409);assert.equal(m.calls.length,0);
 r=await handleSocial(request('approve',{...body,requestKey:'two',text:'STANAIC welcomes Alex Morgan as Senior Fellow.'}),{pool,actor,env,fetcher:m.fetch});assert.equal(r.status,201);assert.equal((await r.json()).announcement.id,first.id);assert.equal((await getPublicAnnouncement(pool,first.id)).designation,'Senior Fellow');
 await db.query("UPDATE invitations SET profile='{\"name\":\"Alex M\"}' WHERE id='member-1'");
 assert.equal(await getPublicAnnouncement(pool,first.id),null);r=await handleSocial(request('publish',{id:first.id}),{pool,actor,env,fetcher:m.fetch});assert.equal(r.status,409);assert.equal(m.calls.length,0);
 await db.query("UPDATE invitations SET profile='{}' WHERE id='member-1'");
 r=await handleSocial(request('publish',{id:first.id}),{pool,actor,env:{},fetcher:m.fetch});assert.equal(r.status,503);assert.equal(m.calls.length,0);
 r=await handleSocial(request('publish',{id:first.id}),{pool,actor,env,fetcher:m.fetch});assert.equal(r.status,200);assert.equal((await r.json()).announcement.status,'published');
 const count=m.calls.length;r=await handleSocial(request('publish',{id:first.id}),{pool,actor,env,fetcher:m.fetch});assert.equal((await r.json()).duplicate,true);assert.equal(m.calls.length,count);
 await db.query("UPDATE platform_social_announcements SET status='uncertain',provider_post_url=NULL WHERE id=$1",[first.id]);r=await handleSocial(request('publish',{id:first.id}),{pool,actor,env,fetcher:m.fetch});assert.equal(r.status,409);assert.equal(m.calls.length,count);
 await db.query("UPDATE invitations SET status='revoked' WHERE id='member-1'");assert.equal(await getPublicAnnouncement(pool,first.id),null);r=await handleSocial(request('publish',{id:first.id}),{pool,actor,env,fetcher:m.fetch});assert.equal(r.status,404);
 await db.close();
});
