import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {handlePlatform} from '../lib/platform.mjs';
import {handleManuscripts,validateManuscriptFile} from '../lib/manuscripts.mjs';

async function fixture(t){const pg=new PGlite();t.after(()=>pg.close());await pg.exec(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'));const query=(sql,args)=>sql.includes('CREATE TABLE IF NOT EXISTS stanaic_platform_workspaces')?pg.exec(sql).then(()=>({rows:[]})):pg.query(sql,args);const pool={query,connect:async()=>({query,release(){}})};
 function browser(){let cookie='';async function platform(path,data){const r=await handlePlatform(new Request('https://papers.test/api/platform/'+path,{method:data===undefined?'GET':'POST',headers:{origin:'https://papers.test','content-type':'application/json',cookie},body:data===undefined?undefined:JSON.stringify(data)}),pool);if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()}}
 async function files(path,data,headers={}){const r=await handleManuscripts(new Request('https://papers.test/api/platform/files/'+path,{method:data===undefined?'GET':'POST',headers:{origin:'https://papers.test','content-type':'application/json',cookie,...headers},body:data===undefined?undefined:JSON.stringify(data)}),pool);return {status:r.status,data:r.headers.get('content-type')?.includes('json')?await r.json():await r.text(),response:r}}
 return {platform,files,action:(action,payload={})=>platform('action',{mode:'demo',action,payload})}}
 return {pg,pool,browser};}
const source={name:'Author-name-private.txt',base64:Buffer.from('Anonymised methods and reproducible evidence.').toString('base64'),anonymised:true};
test('private files persist with scoped downloads, deduplication, review locking and no reviewer filename disclosure',async t=>{
 const f=await fixture(t),a=f.browser(),b=f.browser();await a.platform('demo/start',{});await a.action('switchRole',{role:'author'});await a.action('updateProfile',{name:'Sample Author',bio:'',linkedinUrl:''});let r=await a.action('submitPaper',{title:'Sample evaluation manuscript',abstract:'A reproducible evaluation.',manuscript:'Anonymised manuscript body.',consent:true});assert.equal(r.status,200);const id=r.data.state.submissions[0].id;
 r=await a.files('upload',{mode:'demo',submissionId:id,...source});assert.equal(r.status,201,JSON.stringify(r.data));const fileId=r.data.id;
 assert.equal((await a.files('upload',{mode:'demo',submissionId:id,...source})).data.duplicate,true);
 assert.equal(Number((await f.pool.query('SELECT count(*) AS count FROM stanaic_manuscript_files')).rows[0].count),1);
 r=await a.files('download/'+fileId+'?mode=demo');assert.equal(r.status,200);assert.equal(r.data,'Anonymised methods and reproducible evidence.');assert.match(r.response.headers.get('content-disposition'),/^attachment/);assert.doesNotMatch(r.response.headers.get('content-disposition'),/Author-name/);
 await b.platform('demo/start',{});assert.equal((await b.files('download/'+fileId+'?mode=demo')).status,404);
 await a.action('switchRole',{role:'reviewer'});assert.equal((await a.files('list?mode=demo&submissionId='+id)).status,403);
 await a.action('switchRole',{role:'editor'});await a.action('screenPaper',{submissionId:id});await a.action('switchRole',{role:'reviewer'});
 r=await a.files('list?mode=demo&submissionId='+id);assert.equal(r.status,200);assert.equal(r.data.items[0].name,'Anonymised manuscript v1');assert.equal(r.data.canUpload,false);
 assert.equal((await a.files('upload',{mode:'demo',submissionId:id,...source})).status,403);
 await a.action('switchRole',{role:'author'});assert.equal((await a.files('upload',{mode:'demo',submissionId:id,...source})).status,403);
});
test('upload validation rejects binary text, active PDFs, spoofed types, missing anonymity and oversized content',()=>{
 assert.equal(validateManuscriptFile(source).mime,'text/plain; charset=utf-8');
 const pdf={name:'manuscript.pdf',base64:Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF').toString('base64'),anonymised:true};assert.equal(validateManuscriptFile(pdf).mime,'application/pdf');
 for(const item of [{...source,anonymised:false},{...source,name:'../private.txt'},{...source,name:'manuscript.docx'},{...source,base64:Buffer.from([0,255,0]).toString('base64')},{...pdf,base64:Buffer.from('%PDF-1.7 /JavaScript (alert) %%EOF').toString('base64')},{...pdf,base64:Buffer.from('not a pdf').toString('base64')},{...source,base64:Buffer.alloc(2*1024*1024+1).toString('base64')}])assert.throws(()=>validateManuscriptFile(item));
});
test('upload endpoint rejects absent sessions, cross-site writes and oversized requests',async t=>{
 const f=await fixture(t),a=f.browser();assert.equal((await a.files('list?mode=demo&submissionId=none')).status,401);
 assert.equal((await a.files('upload',{mode:'demo',...source},{origin:'https://other.test'})).status,403);
 assert.equal((await a.files('upload',{mode:'demo',padding:'x'.repeat(3*1024*1024)})).status,413);
});

test('public demo attachment storage has a shared upper bound across workspaces',async t=>{
 const f=await fixture(t),a=f.browser();await a.platform('demo/start',{});await a.action('switchRole',{role:'author'});const r=await a.action('submitPaper',{title:'Quota test',abstract:'Synthetic',manuscript:'Synthetic',consent:true});const id=r.data.state.submissions[0].id;await a.files('upload',{mode:'demo',submissionId:id,...source});
 await f.pool.query('UPDATE stanaic_manuscript_files SET size=$1',[50*1024*1024]);
 const blocked=await a.files('upload',{mode:'demo',submissionId:id,...source,base64:Buffer.from('Different synthetic file').toString('base64')});assert.equal(blocked.status,413);assert.match(blocked.data.error,/Shared demonstration/);
});
