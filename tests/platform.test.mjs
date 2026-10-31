import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { handlePlatform, platformAction, platformSeed, reservePlatformCheckoutAttempt, getPlatformOrder, setPlatformCheckoutSession, applyPaymentEvent, getPlatformRefund, setPlatformRefundPending, applyRefundEvent, verifyCredentialSignature } from '../lib/platform.mjs';

async function fixture(){const pg=new PGlite();await pg.exec(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'));const query=(sql,args)=>sql.includes('CREATE TABLE IF NOT EXISTS stanaic_platform_workspaces')?pg.exec(sql).then(()=>({rows:[]})):pg.query(sql,args);const pool={query,connect:async()=>({query,release(){}})};const env={OWNER_EMAIL:'owner@example.org',CREDENTIAL_SIGNING_SECRET:'test-only-long-signing-secret-32-bytes'};let jar='';const request=async(path,data,identity=null,extraHeaders={})=>{const res=await handlePlatform(new Request('https://platform.test/api/platform/'+path,{method:data===undefined?'GET':'POST',headers:{origin:'https://platform.test','content-type':'application/json',cookie:jar,...extraHeaders},body:data===undefined?undefined:JSON.stringify(data)}),pool,identity,env);const set=res.headers.get('set-cookie');if(set)jar=set.split(';')[0];return {response:res,status:res.status,data:await res.json()}};return {pg,pool,env,request,clear:()=>jar='',getCookie:()=>jar}}
const profile={name:'Alex Morgan',bio:'Research practitioner',linkedinUrl:'https://www.linkedin.com/in/alex-example/'};
const owner={id:'owner-id',email:'owner@example.org',emailVerified:true};
const student={id:'student-id',email:'student@example.org',emailVerified:true};

test('database-backed demo: order, lessons, server assessment, independent approval, signed registry and revocation',async()=>{
 const f=await fixture();try{
  let r=await f.request('demo/start',{});assert.equal(r.status,201);assert.match(f.getCookie(),/^stanaic_platform_demo=/);assert.equal(r.data.role,'admin');
  const call=(action,payload={})=>f.request('action',{mode:'demo',action,payload});
  r=await call('switchRole',{role:'learner'});assert.equal(r.data.role,'learner');assert.ok(!r.data.permissions.includes('simulatePayment'));
  await call('updateProfile',profile);r=await call('createOrder',{courseId:'agent-control-foundations'});assert.equal(r.status,200);assert.equal(r.data.state.enrolments[0].status,'active');
  assert.equal((await call('issueCredential',{attemptId:'missing'})).status,403);
  for(const lessonId of ['authority','evidence','revalidation'])assert.equal((await call('completeLesson',{courseId:'agent-control-foundations',lessonId})).status,200);
  r=await call('submitAssessment',{courseId:'agent-control-foundations',answers:[1,0,2,1,0]});assert.equal(r.data.score,100);assert.equal(r.data.state.attempts[0].status,'awaiting_review');assert.ok(!('answers' in r.data.state.attempts[0]));const attemptId=r.data.state.attempts[0].id;
  await call('switchRole',{role:'assessor'});assert.equal((await call('approveAssessment',{attemptId,feedback:'Reviewed required knowledge evidence.'})).status,200);
  await call('switchRole',{role:'registrar'});r=await call('issueCredential',{attemptId});assert.equal(r.status,200);const id=r.data.credentialId;const sessionCookie=f.getCookie();assert.match(id,/^DEMO-/);assert.equal((await call('issueCredential',{attemptId})).status,409);
  f.clear();r=await f.request('verify/'+id);assert.equal(r.status,200);assert.equal(r.data.credential.status,'valid');assert.equal(r.data.signatureVerified,true);assert.equal(r.data.credential.learnerId,undefined);assert.equal(r.data.credential.learnerName,'Identity withheld');
  const stored=(await f.pool.query('SELECT state FROM stanaic_platform_workspaces WHERE demo=true')).rows[0].state;assert.equal(stored.credentials[0].status,'valid');assert.ok(verifyCredentialSignature(stored.credentials[0],f.env));stored.credentials[0].learnerName='Tampered';assert.equal(verifyCredentialSignature(stored.credentials[0],f.env),false);r=await f.request('action',{mode:'demo',action:'revokeCredential',payload:{credentialId:id,reason:'Testing revocation propagation.'}},null,{cookie:sessionCookie});assert.equal(r.status,200);r=await f.request('verify/'+id);assert.equal(r.data.credential.status,'revoked');assert.equal(r.data.signatureVerified,true);
 }finally{await f.pg.close()}
});

test('live identity boundary, per-learner isolation, no role switching and no competing member store',async()=>{
 const f=await fixture();try{
  assert.equal((await f.request('state')).status,401);
  assert.equal((await f.request('state',undefined,{...student,emailVerified:false})).status,403);
  let r=await f.request('state',undefined,student);assert.equal(r.data.role,'learner');assert.equal(r.data.state.members.length,0);
  assert.equal((await f.request('action',{action:'switchRole',payload:{role:'superadmin'}},student)).status,403);
  await f.request('action',{action:'updateProfile',payload:profile},student);
  r=await f.request('action',{action:'createOrder',payload:{courseId:'agent-control-foundations'}},student);assert.equal(r.data.state.orders.length,1);
  r=await f.request('state',undefined,{id:'another-id',email:'another@example.org',emailVerified:true});assert.equal(r.data.state.orders.length,0);assert.equal(r.data.state.enrolments.length,0);
  assert.equal((await f.request('action',{action:'createMember',payload:{name:'No',email:'x@example.org',designation:'No',consent:true}},owner)).status,409);
  assert.equal((await f.request('action',{action:'grantRole',payload:{email:'another@example.org',role:'registrar'}},student)).status,403);
  assert.equal((await f.request('action',{action:'grantRole',payload:{email:'another@example.org',role:'registrar'}},owner)).status,200);
  r=await f.request('state',undefined,{id:'another-id',email:'another@example.org',emailVerified:true});assert.equal(r.data.role,'registrar');
  assert.equal((await f.request('action',{action:'simulatePayment',payload:{orderId:'none'}},owner)).status,403);
 }finally{await f.pg.close()}
});

test('journal workflow enforces assignment, conflict declaration, author proof approval and editor ownership separation',async()=>{
 const f=await fixture();try{
  await f.request('demo/start',{});const call=(action,payload={})=>f.request('action',{mode:'demo',action,payload});
  await call('switchRole',{role:'author'});await call('updateProfile',profile);
  let r=await call('submitPaper',{title:'Agent authority evidence',abstract:'A reproducible governance study.',manuscript:'An anonymised original sample manuscript.',consent:true});assert.equal(r.status,200);const id=r.data.state.submissions[0].id;
  await call('switchRole',{role:'editor'});assert.equal((await call('publishPaper',{submissionId:id})).status,409);await call('screenPaper',{submissionId:id});
  r=await call('switchRole',{role:'reviewer'});assert.equal(r.data.state.submissions[0].authorId,undefined);assert.equal(r.data.state.submissions[0].authorName,undefined);
  assert.equal((await call('reviewPaper',{submissionId:id,notes:'Review without conflict statement.'})).status,400);
  await call('reviewPaper',{submissionId:id,notes:'Scope and evidence reviewed; accept with clear limitations.',noConflict:true,recommendation:'accept'});
  await call('switchRole',{role:'editor'});await call('decidePaper',{submissionId:id,decision:'accepted'});assert.equal((await call('publishPaper',{submissionId:id})).status,409);
  await call('switchRole',{role:'author'});await call('approveProof',{submissionId:id,consent:true,licence:'Author-approved sample licence'});
  await call('switchRole',{role:'editor'});r=await call('publishPaper',{submissionId:id});assert.equal(r.data.state.submissions[0].status,'published');
 }finally{await f.pg.close()}
});

test('Stripe payment event authoritative binding and idempotency prevent duplicate enrolment or wrong payment access',async()=>{
 const f=await fixture();try{
  await f.request('state',undefined,owner);let r=await f.request('action',{action:'updateCourse',payload:{courseId:'agent-control-foundations',price:11900}},owner);assert.equal(r.status,200);
  await f.request('action',{action:'updateProfile',payload:profile},student);r=await f.request('action',{action:'createOrder',payload:{courseId:'agent-control-foundations'}},student);const id=r.data.orderId;assert.equal(r.data.state.courses[0].locked,true);assert.equal(r.data.state.courses[0].lessons[0].body,undefined);assert.equal(r.data.state.courses[0].questions.length,0);const catalogue=await f.request('catalogue');assert.equal(catalogue.data.courses[0].lessons[0].body,undefined);assert.equal(catalogue.data.courses[0].questions,undefined);
  assert.equal((await getPlatformOrder(f.pool,student,f.env,id)).amountMinor,11900);
  await assert.rejects(getPlatformOrder(f.pool,owner,f.env,id),/another account/);
  await setPlatformCheckoutSession(f.pool,student,f.env,id,'cs_test_bound');
  const event={eventId:'evt_123',type:'checkout.session.completed',orderId:id,ownerId:student.id,amountMinor:11900,currency:'USD',paymentStatus:'paid',checkoutSessionId:'cs_test_bound',paymentIntent:'pi_test_123'};
  await assert.rejects(applyPaymentEvent(f.pool,f.env,{...event,amountMinor:1}),/does not match/);
  await assert.rejects(applyPaymentEvent(f.pool,f.env,{...event,checkoutSessionId:'cs_other'}),/checkout session/);
  await assert.rejects(reservePlatformCheckoutAttempt(f.pool,student,f.env,id,'cs_wrong'),/session changed/);const reservation=await reservePlatformCheckoutAttempt(f.pool,student,f.env,id,'cs_test_bound');assert.deepEqual(await reservePlatformCheckoutAttempt(f.pool,student,f.env,id,'cs_test_bound'),reservation);await setPlatformCheckoutSession(f.pool,student,f.env,id,'cs_test_renewed',reservation);event.checkoutSessionId='cs_test_renewed';assert.equal((await applyPaymentEvent(f.pool,f.env,event)).ok,true);assert.equal((await applyPaymentEvent(f.pool,f.env,event)).deduplicated,true);assert.equal((await applyPaymentEvent(f.pool,f.env,{...event,eventId:'evt_async_2',type:'checkout.session.async_payment_succeeded'})).deduplicated,true);
  r=await f.request('state',undefined,student);assert.equal(r.data.state.orders[0].status,'paid');assert.equal(r.data.state.enrolments.length,1);assert.equal(r.data.state.courses[0].locked,false);assert.ok(r.data.state.courses[0].lessons[0].body);assert.equal(r.data.state.courses[0].questions.length,5);assert.equal((await f.pool.query("SELECT state FROM stanaic_platform_workspaces WHERE id='institution-live'")).rows[0].state.outbox.length,1);await f.request('action',{action:'requestRefund',payload:{orderId:id,reason:'Requested full refund.'}},student);await assert.rejects(getPlatformRefund(f.pool,student,f.env,id),/finance officer/);const refund=await getPlatformRefund(f.pool,owner,f.env,id);assert.equal(refund.idempotencyKey,'stanaic-refund-'+id);await setPlatformRefundPending(f.pool,owner,f.env,id,'re_test_123');const refunded={eventId:'evt_refund_1',type:'refund.updated',providerRefundId:'re_test_123',orderId:id,paymentIntent:'pi_test_123',amountMinor:11900,currency:'USD',status:'succeeded'};await assert.rejects(applyRefundEvent(f.pool,f.env,{...refunded,amountMinor:1}),/does not match/);assert.equal((await applyRefundEvent(f.pool,f.env,refunded)).ok,true);assert.equal((await applyRefundEvent(f.pool,f.env,refunded)).deduplicated,true);r=await f.request('state',undefined,student);assert.equal(r.data.state.orders[0].status,'refunded');assert.equal(r.data.state.enrolments[0].status,'withdrawn');await applyRefundEvent(f.pool,f.env,{...refunded,eventId:'evt_late_refund_failure',type:'refund.failed',status:'failed'});r=await f.request('state',undefined,student);assert.equal(r.data.state.orders[0].status,'refunded');assert.equal(r.data.state.orders[0].refundStatus,'failed');assert.equal(r.data.state.enrolments[0].status,'withdrawn');
 }finally{await f.pg.close()}
});

test('origin checks and workspace isolation reject cross-site writes and missing cookies',async()=>{
 const f=await fixture();try{assert.equal((await f.request('demo/start',{},null,{origin:'https://attacker.example'})).status,403);await f.request('demo/start',{});f.clear();assert.equal((await f.request('state?mode=demo')).status,401)}finally{await f.pg.close()}
});


test('authoring keeps answer keys private; manual payment flag false fails closed; every assigned reviewer must finish',async()=>{
 const f=await fixture();try{
  let r=await f.request('action',{action:'createCourse',payload:{title:'Original review course',summary:'Original knowledge material',price:0,version:'1.0',published:true,lessons:[{title:'A lesson',body:'An evidence-preserving lesson.'}],questions:[{prompt:'Which option?',options:['One','Two'],answerIndex:1}]}},owner);assert.equal(r.status,200);assert.equal(r.data.state.answerKeys,undefined);assert.equal(r.data.state.courses.at(-1).questions[0].answerIndex,undefined);
  const a={actorId:'finance-id',role:'finance',demo:false};const state=platformSeed(false);state.orders.push({id:'pending-order',status:'pending'});assert.throws(()=>platformAction(state,a,'manualPayment',{orderId:'pending-order',reference:'ref'},{MANUAL_PAYMENTS_ENABLED:'false'}),/not enabled/);
  let s=platformSeed(false);s.submissions.push({id:'paper',authorId:'author-id',title:'Paper',status:'under_review',reviewerIds:['reviewer-one','reviewer-two'],reviews:[],versions:[]});
  s=platformAction(s,{actorId:'reviewer-one',role:'reviewer',demo:false},'reviewPaper',{submissionId:'paper',notes:'First independent review.',noConflict:true,recommendation:'accept'}).state;assert.equal(s.submissions[0].status,'under_review');
  assert.throws(()=>platformAction(s,{actorId:'editor-id',role:'editor',demo:false},'decidePaper',{submissionId:'paper',decision:'accepted'}),/required review quorum/);
  s=platformAction(s,{actorId:'reviewer-two',role:'reviewer',demo:false},'reviewPaper',{submissionId:'paper',notes:'Second independent review.',noConflict:true,recommendation:'accept'}).state;assert.equal(s.submissions[0].status,'reviews_received');
  s=platformAction(s,{actorId:'editor-id',role:'editor',demo:false},'decidePaper',{submissionId:'paper',decision:'accepted'}).state;assert.equal(s.submissions[0].status,'accepted');
  assert.throws(()=>platformAction(s,{actorId:'author-id',role:'author',demo:false},'approveProof',{submissionId:'paper',consent:true}),/publication licence is not configured/);
 }finally{await f.pg.close()}
});
