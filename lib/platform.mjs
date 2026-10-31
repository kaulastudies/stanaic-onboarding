import { createHash, randomBytes, randomUUID, timingSafeEqual, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const PLATFORM_ROLES = Object.freeze({superadmin:'Super administrator',admin:'Secretariat administrator',maintainer:'Membership maintainer',courseadmin:'Course administrator',assessor:'Instructor / assessor',registrar:'Credential registrar',editor:'Managing editor',reviewer:'Peer reviewer',finance:'Finance officer',content:'Content editor',auditor:'Read-only auditor',learner:'Member / learner',author:'Research author'});
const GRANTS = {
  superadmin:['updateProfile','createOrder','completeLesson','submitAssessment','approveAssessment','issueCredential','revokeCredential','submitPaper','screenPaper','assignReviewer','reviewPaper','decidePaper','approveProof','publishPaper','publishResource','updateCourse','createCourse','grantRole','requestRefund','approveRefund','manualPayment','prepareAnnouncement','createMember','approveMember','reviewMember','updateMember'],
  admin:['prepareAnnouncement','createMember','approveMember','updateMember','updateProfile'],maintainer:['reviewMember','updateProfile'],
  courseadmin:['updateCourse','createCourse','updateProfile'],assessor:['approveAssessment','updateProfile'],registrar:['issueCredential','revokeCredential','updateProfile'],
  editor:['screenPaper','assignReviewer','decidePaper','publishPaper','updateProfile'],reviewer:['reviewPaper','updateProfile'],
  finance:['approveRefund','manualPayment','updateProfile'],content:['publishResource','prepareAnnouncement','updateProfile'],auditor:['updateProfile'],
  learner:['updateProfile','createOrder','completeLesson','submitAssessment','submitPaper','approveProof','requestRefund'],author:['updateProfile','submitPaper','approveProof'],
};
const DEMO_EXTRA=['switchRole','resetDemo'];
const TTL=6*60*60*1000,MAX_STATE_BYTES=1500000;
const hash=x=>createHash('sha256').update(String(x||'')).digest('hex');
const token=()=>randomBytes(32).toString('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const json=(data,status=200,cookie)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
const text=(v,label,max=2000,required=true)=>{if(typeof v!=='string'||v.trim().length>max||(required&&!v.trim()))fail(400,`Check ${label}.`);return v.trim()};
const address=v=>{const a=text(v,'email address',254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a))fail(400,'Enter a valid email address.');return a};
const uri=(v,label='URL')=>{const u=text(v,label,1000);try{if(new URL(u).protocol!=='https:')throw Error()}catch{fail(400,`Use an HTTPS ${label}.`)}return u};
const linkedin=v=>{if(!v)return '';const u=uri(v,'LinkedIn profile URL');const p=new URL(u);if(!['linkedin.com','www.linkedin.com'].includes(p.hostname)||!/^\/in\/[^/]+\/?$/.test(p.pathname))fail(400,'Use a LinkedIn /in/ profile URL.');return u};
const cookieJar=r=>Object.fromEntries((r.headers.get('cookie')||'').split(';').map(x=>x.trim().split('=')));
const isLocal=url=>['localhost','127.0.0.1','[::1]'].includes(url.hostname);
const demoCookie=(request,value,age=TTL/1000)=>`stanaic_platform_demo=${value}; Path=/api/platform; HttpOnly; ${isLocal(new URL(request.url))?'':'Secure; '}SameSite=Strict; Max-Age=${age}`;
export const platformPermissions=(role,demo=false)=>[...(GRANTS[role]||[]),...(demo?DEMO_EXTRA:[]),...(demo&&['finance','superadmin'].includes(role)?['simulatePayment']:[])];

export function originalCourses(){return [
 {id:'agent-control-foundations',title:'Agent Control Foundations',summary:'An original introductory STANAIC platform learning unit on authority boundaries, evaluation evidence and incident revalidation.',price:0,currency:'USD',version:'1.0',award:'Certificate of Completion',published:true,lessons:[
 {id:'authority',title:'Delegated authority',body:'An agent needs a defined task, a permitted set of tools and an execution boundary. Identify who can authorise consequential actions and when a person must review a proposed action. A broad task does not grant permission to use every available tool.'},
 {id:'evidence',title:'Evaluation evidence',body:'Record the instruction, model version, policy version, tool calls, responses and approvals needed to reproduce an evaluation. Redact secrets and minimise personal data. A correct final answer can still contain an unauthorised action.'},
 {id:'revalidation',title:'Containment and revalidation',body:'Contain execution when authority is exceeded. Preserve relevant evidence, identify the control owner and correct the failure. Re-run targeted tests before controlled re-entry. Record residual risks and decisions rather than assuming that task success proves control.'}
 ],questions:[
 {id:'q1',prompt:'Which action requires explicit delegated authority?',options:['Reading an approved public source','Sending a consequential external message','Listing available tools']},
 {id:'q2',prompt:'What evidence supports reproducibility?',options:['Versioned instructions, environment and tool traces','Only the final answer','The model name alone']},
 {id:'q3',prompt:'The task succeeds through an unapproved tool. What follows?',options:['Treat success as sufficient','Delete the trace','Record the boundary failure and investigate']},
 {id:'q4',prompt:'What should precede controlled re-entry after a failure?',options:['Immediate resumption','Control correction and targeted revalidation','Payment of a course fee']},
 {id:'q5',prompt:'What makes a completion credential eligible?',options:['Required evidence, passing assessment and authorised approval','A payment alone','A senior job title']}
 ]}
]}
const ANSWERS={'agent-control-foundations':[1,0,2,1,0]};
export function platformSeed(demo=false){return {version:1,courses:originalCourses(),answerKeys:{...ANSWERS},profiles:demo?[{id:'demo-learner',name:'Alex Morgan',email:'alex@example.org',linkedinUrl:'',bio:''}]:[],members:demo?[{id:'sample-member',name:'Alex Morgan',email:'alex@example.org',designation:'Committee-approved sample role',status:'submitted',consent:true,reviewNote:''}]:[],orders:[],enrolments:[],attempts:[],credentials:[],submissions:[],resources:[],audit:[],outbox:[],paymentEvents:[],settings:{name:'STANAIC',journal:'Journal of AI Governance and Assurance',demo,completionThreshold:80}}}
let schemaPromises=new WeakMap();
export async function ensurePlatformSchema(pool){let p=schemaPromises.get(pool);if(!p){p=(async()=>{const sql=await readFile(new URL('../db/platform.sql',import.meta.url),'utf8');const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(73104010)');await c.query(sql);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}})().catch(e=>{schemaPromises.delete(pool);throw e});schemaPromises.set(pool,p)}return p}

export async function resolvePlatformActor(request,pool,identity,env={},mode='live'){
 const now=Date.now();
 if(mode==='demo'){
  const cookie=cookieJar(request).stanaic_platform_demo;
  if(!cookie)fail(401,'Start an isolated demonstration workspace first.');
  const session=(await pool.query('SELECT * FROM stanaic_platform_sessions WHERE token_hash=$1 AND expires_at>$2',[hash(cookie),now])).rows[0];
  if(!session)fail(401,'Your demonstration workspace expired. Start a new one.');
  return {workspaceId:session.workspace_id,actorId:session.actor_id,role:session.role,demo:true,email:'alex@example.org'};
 }
 if(!identity?.id||!identity?.email)fail(401,'Sign in with your verified account to use the live platform.');
 if(identity.emailVerified!==true)fail(403,'Verify your email address first.');
 const email=identity.email.toLowerCase();let role='learner';
 if(email===env.OWNER_EMAIL?.toLowerCase()&&(!env.OWNER_USER_ID||identity.id===env.OWNER_USER_ID))role='superadmin';
 else {
  const granted=(await pool.query('SELECT * FROM stanaic_platform_roles WHERE email=$1',[email])).rows[0];
  if(granted){if(granted.user_id&&granted.user_id!==identity.id)fail(403,'This platform role belongs to a different verified identity.');await pool.query('UPDATE stanaic_platform_roles SET user_id=$1 WHERE email=$2 AND user_id IS NULL',[identity.id,email]);role=granted.role}
  else {const staff=(await pool.query('SELECT role,user_id FROM staff WHERE email=$1',[email])).rows[0];if(staff){if(staff.user_id&&staff.user_id!==identity.id)fail(403,'This staff entry belongs to a different verified identity.');role=({admin:'admin',maintainer:'maintainer',viewer:'auditor'})[staff.role]||'learner'}}
 }
 if(!PLATFORM_ROLES[role])fail(403,'Your platform role is not configured.');
 return {workspaceId:'institution-live',actorId:identity.id,role,demo:false,email,name:identity.name||''};
}
const own=(actor,record)=>actor.demo?record.learnerId==='demo-learner'||record.authorId==='demo-learner':record.learnerId===actor.actorId||record.authorId===actor.actorId;
function projection(state,actor){const s=structuredClone(state);const role=actor.role;const staff=!['learner','author'].includes(role);s.profile=s.profiles.find(p=>p.id===actor.actorId)||{id:actor.actorId,name:actor.name||(actor.demo?'Alex Morgan':''),email:actor.email,linkedinUrl:'',bio:''};delete s.profiles;delete s.paymentEvents;delete s.answerKeys;
 if(!['superadmin','admin','maintainer','auditor','content'].includes(role))s.members=[];
 if(!['superadmin','finance','auditor'].includes(role))s.orders=s.orders.filter(o=>own(actor,o));
 if(!['superadmin','courseadmin','assessor','registrar','auditor'].includes(role)){s.enrolments=s.enrolments.filter(o=>own(actor,o));s.attempts=s.attempts.filter(o=>own(actor,o));s.credentials=s.credentials.filter(o=>own(actor,o))}
 if(role==='reviewer')s.submissions=s.submissions.filter(p=>['under_review','reviews_received','accepted','revision_requested','rejected','published'].includes(p.status)&&p.reviewerIds.includes(actor.actorId)).map(({authorId,authorName,authorEmail,linkedinUrl,...p})=>({...p,reviews:p.reviews.filter(r=>r.reviewerId===actor.actorId)}));
 else if(['learner','author'].includes(role))s.submissions=s.submissions.filter(p=>own(actor,p)).map(({reviewerIds,...p})=>({...p,reviews:p.reviews.map(({reviewerId,...r})=>r)}));
 else if(!['superadmin','editor','auditor'].includes(role))s.submissions=[];
 s.attempts=s.attempts.map(({answers,...a})=>({...a,learnerName:state.profiles.find(p=>p.id===a.learnerId)?.name||'Learner'}));s.submissions=s.submissions.map(({versions,...p})=>({...p,versionCount:versions?.length||0}));
 if(!['superadmin','admin','auditor'].includes(role)){s.audit=[];s.outbox=s.outbox.filter(o=>o.recipientId===actor.actorId).map(({recipient,...o})=>o)}
 if(!staff)s.courses=s.courses.filter(c=>c.published);s.courses=s.courses.map(c=>{const entitled=['superadmin','courseadmin','assessor'].includes(role)||state.enrolments.some(e=>e.learnerId===learnerId(actor)&&e.courseId===c.id&&e.status==='active');return entitled?{...c,locked:false}:{...c,locked:true,questionCount:c.questions.length,questions:[],lessons:c.lessons.map(({id,title})=>({id,title}))}});if(!['superadmin','editor'].includes(role))delete s.availableReviewers;
 return s;
}
const bundle=(state,actor,extra={})=>({mode:actor.demo?'demo':'live',role:actor.role,permissions:platformPermissions(actor.role,actor.demo),state:projection(state,actor),...extra});
function getItem(list,id,label){const r=list.find(i=>i.id===id);if(!r)fail(404,`${label} not found.`);return r}
function audit(s,actor,action,target,detail){s.audit.unshift({id:randomUUID(),at:Date.now(),actorId:actor.actorId,role:actor.role,action,target,detail});s.audit=s.audit.slice(0,1000)}
function queue(s,kind,recipientId,text){s.outbox.unshift({id:randomUUID(),kind,recipientId,text,status:'queued',createdAt:Date.now()});s.outbox=s.outbox.slice(0,500)}
function enrol(s,order){let e=s.enrolments.find(e=>e.learnerId===order.learnerId&&e.courseId===order.courseId);if(!e){e={id:randomUUID(),learnerId:order.learnerId,courseId:order.courseId,status:'active',completedLessons:[],createdAt:Date.now()};s.enrolments.push(e)}else e.status='active';return e}
const learnerId=a=>a.demo?'demo-learner':a.actorId;
const actorForRole=(role)=>['learner','author'].includes(role)?'demo-learner':`demo-${role}`;

export function platformAction(state,actor,action,payload={},env={}){
 const s=structuredClone(state),p=payload,now=Date.now();
 if(!platformPermissions(actor.role,actor.demo).includes(action))fail(403,'Your current role cannot perform this action.');
 let target='',detail='',extra={};
 if(action==='updateProfile'){
  const id=actor.actorId;let profile=s.profiles.find(p=>p.id===id);if(!profile){profile={id,email:actor.email};s.profiles.push(profile)}
  profile.name=text(p.name,'full name',120);if(p.publicCredentialNameConsent!==undefined)profile.publicCredentialNameConsent=p.publicCredentialNameConsent===true;profile.bio=text(p.bio||'','biography',1500,false);profile.linkedinUrl=linkedin(p.linkedinUrl);if(actor.demo&&p.email)profile.email=address(p.email);detail='Personal profile updated';
 } else if(action==='createOrder'){
  const course=getItem(s.courses,p.courseId,'Course');if(!course.published)fail(409,'This course is not published.');const id=learnerId(actor);
  const existing=s.orders.find(o=>o.courseId===course.id&&o.learnerId===id&&!['refunded','cancelled'].includes(o.status));if(existing)return {state:s,extra:{orderId:existing.id}};
  if(s.orders.length>=500)fail(429,'Workspace order limit reached.');const order={id:randomUUID(),courseId:course.id,courseTitle:course.title,learnerId:id,amount:course.price,currency:course.currency,status:course.price===0?'paid':'pending',createdAt:now,paymentMethod:course.price===0?'free':null};s.orders.unshift(order);if(course.price===0)enrol(s,order);target=order.id;detail=course.price===0?'Free enrolment activated':'Order created; payment confirmation required';extra.orderId=order.id;
 } else if(action==='simulatePayment'){
  if(!actor.demo)fail(403,'Payment simulation is only available in isolated demonstration workspaces.');const o=getItem(s.orders,p.orderId,'Order');const eventId=text(p.eventId||`demo-payment-${o.id}`,'event ID',150);if(s.paymentEvents.includes(eventId))return {state:s,extra:{deduplicated:true}};if(o.status!=='pending')fail(409,'The order is not awaiting payment.');s.paymentEvents.push(eventId);o.status='paid';o.paymentMethod='demo';enrol(s,o);target=o.id;detail='Simulated payment confirmed; enrolment activated';queue(s,'receipt',o.learnerId,`Payment recorded for ${o.courseTitle}.`);
 } else if(action==='manualPayment'){
  if(env.MANUAL_PAYMENTS_ENABLED!=='true'&&!actor.demo)fail(503,'Manual payment reconciliation is not enabled. Configure approved invoice and reconciliation controls first.');const o=getItem(s.orders,p.orderId,'Order');if(o.status!=='pending')fail(409,'Order is not awaiting payment.');o.status='paid';o.paymentMethod='reconciled_invoice';o.reference=text(p.reference,'bank reconciliation reference',200);enrol(s,o);target=o.id;detail='Invoice settlement reconciled by finance';
 } else if(action==='completeLesson'){
  const c=getItem(s.courses,p.courseId,'Course'),e=s.enrolments.find(e=>e.courseId===c.id&&e.learnerId===learnerId(actor)&&e.status==='active');if(!e)fail(403,'An active enrolment is required.');getItem(c.lessons,p.lessonId,'Lesson');if(!e.completedLessons.includes(p.lessonId))e.completedLessons.push(p.lessonId);target=e.id;detail='Lesson completion recorded';
 } else if(action==='submitAssessment'){
  const c=getItem(s.courses,p.courseId,'Course'),e=s.enrolments.find(e=>e.courseId===c.id&&e.learnerId===learnerId(actor)&&e.status==='active');if(!e||c.lessons.some(l=>!e.completedLessons.includes(l.id)))fail(409,'Complete every lesson with an active enrolment first.');const answers=s.answerKeys?.[c.id]||ANSWERS[c.id];if(!answers)fail(409,'An assessment has not been configured for this course.');if(!Array.isArray(p.answers)||p.answers.length!==answers.length||p.answers.some((v,i)=>!Number.isInteger(v)||v<0||v>=c.questions[i].options.length))fail(400,'Answer every assessment question.');
  const previous=s.attempts.filter(a=>a.learnerId===learnerId(actor)&&a.courseId===c.id);if(previous.length>=5)fail(429,'Five attempts have been used. Contact course administration for a review.');if(previous.some(a=>['awaiting_review','approved','credential_issued'].includes(a.status)))fail(409,'A passing assessment is already awaiting review or completed.');
  const score=Math.round(p.answers.filter((v,i)=>v===answers[i]).length/answers.length*100);const attempt={id:randomUUID(),courseId:c.id,courseVersion:c.version,learnerId:learnerId(actor),score,status:score>=80?'awaiting_review':'retry_required',createdAt:now};s.attempts.unshift(attempt);target=attempt.id;detail=`Assessment scored on server: ${score}%`;extra.score=score;
 } else if(action==='approveAssessment'){
  const a=getItem(s.attempts,p.attemptId,'Assessment');if(a.status!=='awaiting_review'||a.score<80)fail(409,'A passing attempt awaiting review is required.');if(a.learnerId===actor.actorId)fail(403,'An independent assessor must review this attempt.');a.feedback=text(p.feedback||'Required evidence reviewed.','assessment feedback',2000);a.reviewerId=actor.actorId;a.reviewedAt=now;a.status='approved';target=a.id;detail='Assessment approved by independent assessor';
 } else if(action==='issueCredential'){
  const a=getItem(s.attempts,p.attemptId,'Assessment'),c=getItem(s.courses,a.courseId,'Course');if(a.status!=='approved'||a.score<80)fail(409,'Approved passing assessment is required.');const e=s.enrolments.find(e=>e.learnerId===a.learnerId&&e.courseId===a.courseId&&e.status==='active');if(!e)fail(409,'Active enrolment is required.');if(s.credentials.some(v=>v.learnerId===a.learnerId&&v.courseId===a.courseId&&v.courseVersion===a.courseVersion))fail(409,'This learner already has a credential for the programme version.');const person=s.profiles.find(p=>p.id===a.learnerId);if(!person?.name)fail(409,'The learner must save their full name before a credential is issued.');const cred={id:(actor.demo?'DEMO-':'STN-')+randomBytes(12).toString('hex').toUpperCase(),learnerId:a.learnerId,learnerName:person.name,courseId:c.id,courseTitle:c.title,courseVersion:a.courseVersion,status:'valid',issuedAt:now,issuedBy:actor.actorId,award:c.award,demo:actor.demo,publicNameConsent:person.publicCredentialNameConsent===true,disclaimer:actor.demo?'Demonstration credential. No professional validity.':'Certificate of Completion for the stated original course; not a professional certification or accreditation.'};if(!actor.demo&&!env.CREDENTIAL_SIGNING_SECRET)fail(503,'Credential signing is not configured. Configure CREDENTIAL_SIGNING_SECRET before live issuance.');if(env.CREDENTIAL_SIGNING_SECRET)cred.signature=signCredential(cred,env.CREDENTIAL_SIGNING_SECRET);s.credentials.unshift(cred);a.status='credential_issued';target=cred.id;detail='Completion credential registered';queue(s,'credential',a.learnerId,`Credential ${cred.id} is available in your portal.`);extra.credentialId=cred.id;
 } else if(action==='revokeCredential'){
  const c=getItem(s.credentials,p.credentialId,'Credential');if(c.status==='revoked')fail(409,'Credential is already revoked.');c.status='revoked';c.reason=text(p.reason,'revocation reason',1500);c.revokedAt=now;c.revokedBy=actor.actorId;target=c.id;detail='Credential revoked; public verification updated';
 } else if(action==='requestRefund'){
  const o=getItem(s.orders,p.orderId,'Order');if(o.learnerId!==learnerId(actor))fail(403,'Only the purchaser may request their refund.');if(o.status!=='paid'||o.amount===0)fail(409,'A paid, non-zero order is required.');o.refundRequested=true;o.refundReason=text(p.reason,'refund reason',1000);target=o.id;detail='Refund requested for finance review';
 } else if(action==='approveRefund'){
  const o=getItem(s.orders,p.orderId,'Order');if(!o.refundRequested||o.status!=='paid')fail(409,'A pending refund request is required.');if(!actor.demo)fail(503,'Refund execution needs the configured payment provider. Reconcile in the merchant dashboard until that adapter is enabled.');o.status='refunded';s.enrolments.filter(e=>e.courseId===o.courseId&&e.learnerId===o.learnerId).forEach(e=>e.status='withdrawn');s.credentials.filter(c=>c.courseId===o.courseId&&c.learnerId===o.learnerId).forEach(c=>c.status='suspended');target=o.id;detail='Demo refund approved; entitlement withdrawn and credential flagged';
 } else if(action==='submitPaper'){
  if(p.consent!==true)fail(400,'Confirm authorship, consent and anonymisation.');if(s.submissions.length>=200)fail(429,'Workspace submission limit reached.');const person=s.profiles.find(p=>p.id===learnerId(actor));if(!person?.name)fail(409,'Save your profile before submitting a paper.');const item={id:randomUUID(),authorId:learnerId(actor),authorName:person.name,title:text(p.title,'manuscript title',240),abstract:text(p.abstract,'abstract',5000),manuscript:text(p.manuscript,'anonymised manuscript',50000),declarations:text(p.declarations||'No conflicts declared.','declarations',2000),status:'submitted',reviews:[],reviewerIds:[],versions:[],createdAt:now,proofApproved:false};s.submissions.unshift(item);target=item.id;detail='Manuscript submitted to editorial screening';
 } else if(action==='screenPaper'){
  const item=getItem(s.submissions,p.submissionId,'Submission');if(!['submitted','revised'].includes(item.status))fail(409,'A submitted or revised manuscript is required.');if(item.authorId===actor.actorId)fail(403,'You cannot screen your own manuscript.');item.status='under_review';item.editorId=actor.actorId;item.screenedAt=now;if(actor.demo)item.reviewerIds=['demo-reviewer'];target=item.id;detail='Editorial screening completed';
 } else if(action==='assignReviewer'){
  const item=getItem(s.submissions,p.submissionId,'Submission');if(item.status!=='under_review')fail(409,'The manuscript must be under review.');const id=text(p.reviewerId,'reviewer user ID',150);if(id===item.authorId||id===item.editorId)fail(409,'An independent reviewer is required.');if(!item.reviewerIds.includes(id))item.reviewerIds.push(id);target=item.id;detail='Independent reviewer assigned';
 } else if(action==='reviewPaper'){
  const item=getItem(s.submissions,p.submissionId,'Submission');if(item.status!=='under_review'||!item.reviewerIds.includes(actor.actorId))fail(403,'You must be assigned to this manuscript.');if(item.reviews.some(r=>r.reviewerId===actor.actorId))fail(409,'Your review has already been recorded.');if(p.noConflict!==true)fail(400,'Declare no conflict before reviewing.');const recommendation=['accept','revise','reject'].includes(p.recommendation)?p.recommendation:'revise';item.reviews.push({id:randomUUID(),reviewerId:actor.actorId,notes:text(p.notes,'review rationale',5000),recommendation,createdAt:now});item.status=item.reviewerIds.every(id=>item.reviews.some(r=>r.reviewerId===id))?'reviews_received':'under_review';target=item.id;detail='Confidential peer review received';
 } else if(action==='decidePaper'){
  const item=getItem(s.submissions,p.submissionId,'Submission');const quorum=actor.demo?1:Math.max(2,Number(env.JOURNAL_MIN_REVIEWS)||2);if(item.status!=='reviews_received'||item.reviews.length<quorum||item.reviewerIds.some(id=>!item.reviews.some(r=>r.reviewerId===id)))fail(409,'All assigned independent reviews and the required review quorum must be complete.');if(item.authorId===actor.actorId)fail(403,'You cannot decide your own submission.');if(!['accepted','revision_requested','rejected'].includes(p.decision))fail(400,'Choose an editorial decision.');item.status=p.decision;item.decisionNote=text(p.note||'Editorial decision recorded.','decision note',3000);item.decisionAt=now;target=item.id;detail=`Editorial decision: ${p.decision}`;
 } else if(action==='revisePaper'){
  const item=getItem(s.submissions,p.submissionId,'Submission');if(item.authorId!==learnerId(actor)||item.status!=='revision_requested')fail(403,'A revision request on your own manuscript is required.');item.versions.push({manuscript:item.manuscript,at:now});item.manuscript=text(p.manuscript,'revised manuscript',50000);item.status='revised';item.reviews=[];item.proofApproved=false;target=item.id;detail='Revised manuscript submitted';
 } else if(action==='approveProof'){
  const item=getItem(s.submissions,p.submissionId,'Submission');if(item.authorId!==learnerId(actor)||item.status!=='accepted')fail(403,'Only the author may approve proofs after acceptance.');if(p.consent!==true)fail(400,'Approve the final proof and licence explicitly.');item.proofApproved=true;if(!actor.demo&&!env.JOURNAL_PUBLICATION_LICENCE)fail(503,'The committee-approved publication licence is not configured.');item.licence=text(actor.demo?(p.licence||'Demonstration licence — not for official publication'):env.JOURNAL_PUBLICATION_LICENCE,'publication licence',200);target=item.id;detail='Author proof approval recorded';
 } else if(action==='publishPaper'){
  const item=getItem(s.submissions,p.submissionId,'Submission');if(item.status!=='accepted'||!item.proofApproved)fail(409,'Acceptance and author proof/licence approval are required.');if(item.authorId===actor.actorId)fail(403,'An independent editor must publish this article.');item.status='published';item.publishedAt=now;target=item.id;detail='Article published in the platform catalogue';
 } else if(action==='publishResource'){
  const item={id:randomUUID(),title:text(p.title,'resource title',240),url:uri(p.url,'resource URL'),type:text(p.type||'Research','resource type',80),summary:text(p.summary||'','summary',2000,false),createdAt:now,authorId:actor.actorId};if(s.resources.length>=500)fail(429,'Workspace resource limit reached.');s.resources.unshift(item);target=item.id;detail='Approved research resource published';
 } else if(action==='createCourse'){
  if(s.courses.length>=100)fail(429,'Course catalogue limit reached.');const id=randomUUID(),title=text(p.title,'course title',200),summary=text(p.summary,'course summary',2000),version=text(p.version||'1.0','course version',30);const price=Number(p.price||0);if(!Number.isSafeInteger(price)||price<0||price>10000000)fail(400,'Course fee must be a non-negative integer in minor units.');const currency=text(p.currency||'USD','currency',3).toUpperCase();if(!/^[A-Z]{3}$/.test(currency))fail(400,'Use a three-letter ISO currency code.');
  if(!Array.isArray(p.lessons)||p.lessons.length<1||p.lessons.length>50)fail(400,'Provide between 1 and 50 lessons.');const lessons=p.lessons.map((l,i)=>({id:'lesson-'+(i+1),title:text(l.title,'lesson title',200),body:text(l.body,'lesson material',15000)}));
  if(!Array.isArray(p.questions)||p.questions.length<1||p.questions.length>50)fail(400,'Provide between 1 and 50 assessment questions.');const keys=[];const questions=p.questions.map((q,i)=>{if(!Array.isArray(q.options)||q.options.length<2||q.options.length>6)fail(400,'Each question needs 2 to 6 options.');if(!Number.isInteger(q.answerIndex)||q.answerIndex<0||q.answerIndex>=q.options.length)fail(400,'Each question needs a valid answer index.');keys.push(q.answerIndex);return {id:'question-'+(i+1),prompt:text(q.prompt,'question prompt',2000),options:q.options.map(o=>text(o,'answer option',1000))}});
  s.courses.push({id,title,summary,price,currency,version,award:'Certificate of Completion',published:p.published===true,lessons,questions});s.answerKeys??={};s.answerKeys[id]=keys;target=id;detail='New original course version created';extra.courseId=id;
 } else if(action==='updateCourse'){
  const c=getItem(s.courses,p.courseId,'Course');if(s.enrolments.some(e=>e.courseId===c.id))fail(409,'This version has enrolled learners. Create a new version rather than changing their learning contract.');if(p.price!==undefined){const price=Number(p.price);if(!Number.isSafeInteger(price)||price<0||price>10000000)fail(400,'Course fee must be a non-negative integer in minor currency units.');c.price=price}if(p.title)c.title=text(p.title,'course title',200);c.published=p.published===undefined?c.published:!!p.published;target=c.id;detail='Course configuration updated';
 } else if(action==='createMember'){
  const email=address(p.email);if(s.members.some(m=>m.email===email))fail(409,'A member record exists for this email.');const m={id:randomUUID(),name:text(p.name,'member name',120),email,designation:text(p.designation,'approved designation',120),linkedinUrl:linkedin(p.linkedinUrl),status:'submitted',consent:p.consent===true,createdAt:now};if(!actor.demo&&p.consent!==true)fail(400,'Record the member’s permission to store and announce their details.');s.members.unshift(m);target=m.id;detail='Member record prepared for review';
 } else if(action==='updateMember'){
  const m=getItem(s.members,p.memberId,'Member');m.designation=text(p.designation,'approved designation',120);if(p.linkedinUrl!==undefined)m.linkedinUrl=linkedin(p.linkedinUrl);target=m.id;detail='Membership designation updated; software permissions unchanged';
 } else if(action==='reviewMember'){
  const m=getItem(s.members,p.memberId,'Member');if(m.status!=='submitted')fail(409,'A submitted member record is required.');m.reviewNote=text(p.note||'Profile complete; recommend approval.','review note',1500);m.status='reviewed';m.reviewedBy=actor.actorId;target=m.id;detail='Membership review recommendation recorded';
 } else if(action==='approveMember'){
  const m=getItem(s.members,p.memberId,'Member');if(m.status!=='reviewed')fail(409,'A maintainer review is required.');m.status='approved';m.approvedAt=now;m.approvedBy=actor.actorId;target=m.id;detail='Member approved; announcement can be prepared';
 } else if(action==='prepareAnnouncement'){
  const m=getItem(s.members,p.memberId,'Member');if(m.status!=='approved')fail(409,'Approve the member before preparing an announcement.');if(!m.consent)fail(409,'Public-announcement consent is required.');extra.announcement={memberId:m.id,name:m.name,designation:m.designation,linkedinUrl:m.linkedinUrl||'',text:`We welcome ${m.name} as ${m.designation} at STANAIC.\n\nWe look forward to their contribution to AI governance, assurance and responsible practice.`,status:'draft'};target=m.id;detail='Member welcome draft prepared for authorised review';
 } else if(action==='grantRole'){
  if(actor.demo)fail(409,'Use the simulation role selector in this isolated demo. It does not create real staff accounts.');extra.grant={email:address(p.email),role:text(p.role,'platform role',40)};if(!PLATFORM_ROLES[extra.grant.role]||extra.grant.role==='superadmin')fail(400,'Choose an operational role; ownership changes require the deployment owner process.');detail='Operational role grant recorded';target=extra.grant.email;
 } else fail(400,'Unknown platform action.');
 audit(s,actor,action,target,detail);return {state:s,extra:{...extra,message:detail}};
}
// Revisions are permitted to authors and learners; never editorial actions.
GRANTS.author.push('revisePaper');GRANTS.learner.push('revisePaper');GRANTS.superadmin.push('revisePaper');

/** @param {Request} request @param {any} pool @param {any} identity @param {Record<string, any>} env */
export async function handlePlatform(request,pool,identity=null,env={}){
 let c,inTransaction=false;
 try {
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\/platform\/?/,'');
  if(!['GET','POST'].includes(request.method))fail(405,'Method not supported.');
  if(request.method==='POST'){
   if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')fail(403,'Use this platform page to submit requests.');
   if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON is required.');
  }
  await ensurePlatformSchema(pool);
  if(path.startsWith('verify/')&&request.method==='GET'){
   const id=decodeURIComponent(path.slice(7));if(!/^(DEMO-|STN-)[A-F0-9]{24}$/.test(id))fail(404,'Credential not found.');
   const row=(await pool.query('SELECT record,demo,expires_at FROM stanaic_platform_credentials WHERE id=$1',[id])).rows[0];if(!row||(row.expires_at&&Number(row.expires_at)<Date.now()))fail(404,'Credential not found or demonstration workspace expired.');
   const {reason,learnerId,issuedBy,revokedBy,...storedRecord}=row.record;const record={...storedRecord,learnerName:storedRecord.publicNameConsent?storedRecord.learnerName:'Identity withheld'};return json({credential:record,demo:row.demo,issuer:'STANAIC platform',signatureVerified:row.demo&&!row.record.signature?null:verifyCredentialSignature(row.record,env),verifiedAt:Date.now(),verification:'Server registry lookup. This record is not an external accreditation.'});
  }
  if(path==='catalogue'&&request.method==='GET'){const live=(await pool.query("SELECT state FROM stanaic_platform_workspaces WHERE id='institution-live' AND demo=false")).rows[0]?.state;return json({courses:(live?.courses||originalCourses()).filter(c=>c.published).map(({id,title,summary,price,currency,version,award,lessons})=>({id,title,summary,price,currency,version,award,lessonCount:lessons.length,lessons:lessons.map(({id,title})=>({id,title}))})),resources:live?.resources||[],publications:(live?.submissions||[]).filter(p=>p.status==='published').map(({id,title,abstract,authorName,licence,publishedAt})=>({id,title,abstract,authorName,licence,publishedAt})),sources:[{title:'Existing partner learning platform',url:'https://learn.stanaic.com/'}]})}
  let body={};if(request.method==='POST'){const raw=await request.text();if(raw.length>80000)fail(413,'Request is too large.');try{body=JSON.parse(raw)}catch{fail(400,'Invalid JSON.')}if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Invalid request.');}
  if(path==='demo/start'){
   if(request.method!=='POST')fail(405,'Use POST.');
   const now=Date.now(),ip=hash(env.clientIp||'unknown'),bucket=`start:${ip}:${Math.floor(now/3600000)}`;
   const limit=(await pool.query('INSERT INTO stanaic_platform_limits(key,count,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=stanaic_platform_limits.count+1 RETURNING count',[bucket,now+3600000])).rows[0];if(Number(limit.count)>80)fail(429,'Too many workspace starts. Try again later.');
   const existing=cookieJar(request).stanaic_platform_demo;if(existing){const row=(await pool.query('SELECT s.*,w.state FROM stanaic_platform_sessions s JOIN stanaic_platform_workspaces w ON w.id=s.workspace_id WHERE s.token_hash=$1 AND s.expires_at>$2',[hash(existing),now])).rows[0];if(row)return json(bundle(row.state,{workspaceId:row.workspace_id,actorId:row.actor_id,role:row.role,demo:true,email:'alex@example.org'}));}
   c=await pool.connect();await c.query('BEGIN');inTransaction=true;await c.query('SELECT pg_advisory_xact_lock(73104011)');await c.query('DELETE FROM stanaic_platform_workspaces WHERE demo=true AND expires_at<$1',[now]);await c.query('DELETE FROM stanaic_platform_limits WHERE expires_at<$1',[now]);const n=(await c.query('SELECT count(*) AS count FROM stanaic_platform_workspaces WHERE demo=true')).rows[0];if(Number(n.count)>=500)fail(503,'All demonstration workspaces are occupied. Try again later.');
   const id=randomUUID(),session=token(),expires=now+TTL,state=platformSeed(true);await c.query('INSERT INTO stanaic_platform_workspaces(id,demo,state,expires_at,created_at) VALUES($1,true,$2::jsonb,$3,$4)',[id,JSON.stringify(state),expires,now]);await c.query('INSERT INTO stanaic_platform_sessions(token_hash,workspace_id,role,actor_id,expires_at) VALUES($1,$2,$3,$4,$5)',[hash(session),id,'admin','demo-admin',expires]);await c.query('COMMIT');inTransaction=false;return json(bundle(state,{workspaceId:id,actorId:'demo-admin',role:'admin',demo:true,email:'alex@example.org'}),201,demoCookie(request,session));
  }
  const mode=(request.method==='POST'?body.mode:url.searchParams.get('mode'))==='demo'?'demo':'live';
  const actor=await resolvePlatformActor(request,pool,identity,env,mode);
  c=await pool.connect();await c.query('BEGIN');inTransaction=true;
  if(!actor.demo)await c.query('INSERT INTO stanaic_platform_workspaces(id,demo,state,created_at) VALUES($1,false,$2::jsonb,$3) ON CONFLICT(id) DO NOTHING',[actor.workspaceId,JSON.stringify(platformSeed(false)),Date.now()]);
  const workspace=(await c.query('SELECT * FROM stanaic_platform_workspaces WHERE id=$1 FOR UPDATE',[actor.workspaceId])).rows[0];if(!workspace||workspace.demo!==actor.demo||(workspace.expires_at&&Number(workspace.expires_at)<Date.now()))fail(401,'Workspace is unavailable or expired.');
  let state=workspace.state,extra={};if(!actor.demo){const rows=(await c.query("SELECT id,name,email,designation,profile,reviewed_at FROM invitations WHERE status='approved' ORDER BY created_at DESC LIMIT 500")).rows;state.availableReviewers=['superadmin','editor'].includes(actor.role)?(await c.query("SELECT user_id AS id,email FROM stanaic_platform_roles WHERE role='reviewer' AND user_id IS NOT NULL")).rows:[];state.members=rows.map(row=>{let profile={};try{profile=JSON.parse(row.profile||'{}')}catch{}return {id:row.id,name:row.name,email:row.email,designation:row.designation,status:'approved',linkedinUrl:profile.linkedinUrl||'',consent:profile.publicConsent===true||profile.announcementConsent===true,approvedAt:row.reviewed_at}})}
  if(path==='state'&&request.method==='GET'){
   if(!state.profiles.some(p=>p.id===actor.actorId)&&!actor.demo){state.profiles.push({id:actor.actorId,name:actor.name||'',email:actor.email,linkedinUrl:'',bio:''});await c.query('UPDATE stanaic_platform_workspaces SET state=$1::jsonb WHERE id=$2',[JSON.stringify(state),actor.workspaceId])}
  } else if(path==='action'&&request.method==='POST'){
   const action=text(body.action,'action',80),payload=body.payload||{};if(!actor.demo&&['createMember','reviewMember','approveMember','updateMember'].includes(action))fail(409,'Manage live invitations, designation changes and membership decisions in the existing /admin onboarding module. This workspace reads approved records from that same source.');
   if(action==='switchRole'){
    if(!actor.demo)fail(403,'Role switching is only available in the isolated demonstration.');if(!PLATFORM_ROLES[payload.role])fail(400,'Choose a valid simulation role.');actor.role=payload.role;actor.actorId=actorForRole(actor.role);await c.query('UPDATE stanaic_platform_sessions SET role=$1,actor_id=$2 WHERE token_hash=$3',[actor.role,actor.actorId,hash(cookieJar(request).stanaic_platform_demo)]);
   } else if(action==='resetDemo'){
    if(!actor.demo)fail(403,'Only demonstration records can be reset.');state=platformSeed(true);await c.query('DELETE FROM stanaic_platform_credentials WHERE workspace_id=$1',[actor.workspaceId]);
    // Attachments are initialised lazily; reset must release this sandbox's private file quota too.
    const attachmentTable=await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='stanaic_manuscript_files'");
    if(attachmentTable.rows.length)await c.query('DELETE FROM stanaic_manuscript_files WHERE workspace_id=$1',[actor.workspaceId]);
   } else {
    if(!actor.demo&&action==='assignReviewer'){const reviewer=(await c.query("SELECT user_id FROM stanaic_platform_roles WHERE role='reviewer' AND user_id=$1",[payload.reviewerId])).rows[0];if(!reviewer)fail(400,'Choose a verified reviewer with an assigned platform role. They must sign in once before assignment.');}const changed=platformAction(state,actor,action,payload,env);state=changed.state;extra=changed.extra;
    if(extra.grant){await c.query('INSERT INTO stanaic_platform_roles(email,role,created_by,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO UPDATE SET role=excluded.role,created_by=excluded.created_by,created_at=excluded.created_at',[extra.grant.email,extra.grant.role,actor.actorId,Date.now()]);delete extra.grant}
    if(action==='issueCredential'||action==='revokeCredential'||action==='approveRefund')for(const credential of state.credentials)await c.query('INSERT INTO stanaic_platform_credentials(id,workspace_id,record,demo,expires_at) VALUES($1,$2,$3::jsonb,$4,$5) ON CONFLICT(id) DO UPDATE SET record=excluded.record',[credential.id,actor.workspaceId,JSON.stringify(credential),actor.demo,workspace.expires_at||null]);
   }
   const serialized=JSON.stringify(state);if(Buffer.byteLength(serialized)>MAX_STATE_BYTES)fail(413,'Workspace storage limit reached. Export and archive completed records before adding more.');await c.query('UPDATE stanaic_platform_workspaces SET state=$1::jsonb WHERE id=$2',[serialized,actor.workspaceId]);
  } else fail(404,'Platform endpoint not found.');
  state.settings.integrations=integrationStatus(env,actor.demo);await c.query('COMMIT');inTransaction=false;return json(bundle(state,actor,extra));
 } catch(e){if(c&&inTransaction)await c.query('ROLLBACK');return json({error:e.status?e.message:'The platform is temporarily unavailable. Check database configuration and retry.'},e.status||503)}finally{c?.release()}
}

function integrationStatus(env,demo){return {database:'connected',payments:demo?'isolated simulation':env.STRIPE_SECRET_KEY&&env.STRIPE_WEBHOOK_SECRET?'configured — merchant activation and settlement still require validation':'not connected',email:env.MAIL_MODE==='resend'&&env.RESEND_API_KEY?'provider configured':'protected outbox only',credentials:env.CREDENTIAL_SIGNING_SECRET?'server signing configured':demo?'unsigned demonstration registry':'signing key required',linkedin:env.LINKEDIN_ACCESS_TOKEN&&env.LINKEDIN_AUTHOR_URN&&env.LINKEDIN_VERSION?'publishing credentials configured — account permissions still require validation':'account connection required',llm:env.AI_GENERATION_ENABLED==='true'&&env.AI_GATEWAY_MODEL&&(env.AI_GATEWAY_API_KEY||env.VERCEL_OIDC_TOKEN)?'model configured — verified staff and request consent required':'model generation disabled or not connected',partnerLearning:'existing partner link; no private API configured'}}
function credentialPayload(c){return JSON.stringify({id:c.id,learnerName:c.learnerName,courseId:c.courseId,courseTitle:c.courseTitle,courseVersion:c.courseVersion,issuedAt:c.issuedAt,award:c.award,demo:c.demo,publicNameConsent:c.publicNameConsent===true})}
function signCredential(c,key){return {algorithm:'HMAC-SHA256',value:createHmac('sha256',key).update(credentialPayload(c)).digest('base64url')}}
export function verifyCredentialSignature(c,env={}){if(!c.signature||!env.CREDENTIAL_SIGNING_SECRET)return false;const expected=Buffer.from(signCredential(c,env.CREDENTIAL_SIGNING_SECRET).value);const actual=Buffer.from(c.signature.value||'');return expected.length===actual.length&&timingSafeEqual(expected,actual)}

export async function getPlatformOrder(pool,identity,env,orderId){
 await ensurePlatformSchema(pool);const actor=await resolvePlatformActor(new Request('https://platform.internal'),pool,identity,env,'live');
 const row=(await pool.query("SELECT state FROM stanaic_platform_workspaces WHERE id='institution-live' AND demo=false")).rows[0];
 const o=row?.state?.orders?.find(o=>o.id===orderId);if(!o)fail(404,'Order not found.');if(o.learnerId!==actor.actorId)fail(403,'This order belongs to another account.');
 return {id:o.id,amountMinor:o.amount,currency:o.currency,title:o.courseTitle,ownerId:o.learnerId,status:o.status,workspaceId:'institution-live',checkoutSessionId:o.checkoutSessionId||null,checkoutAttempt:o.checkoutAttempt||0};
}
export async function setPlatformCheckoutSession(pool,identity,env,orderId,sessionId,reservation=null){
 await ensurePlatformSchema(pool);const actor=await resolvePlatformActor(new Request('https://platform.internal'),pool,identity,env,'live');const c=await pool.connect();try{
  await c.query('BEGIN');const row=(await c.query("SELECT state FROM stanaic_platform_workspaces WHERE id='institution-live' AND demo=false FOR UPDATE")).rows[0];const s=row?.state;if(!s)fail(404,'Order not found.');const o=getItem(s.orders,orderId,'Order');if(o.learnerId!==actor.actorId)fail(403,'This order belongs to another account.');if(o.status!=='pending')fail(409,'Order is not awaiting payment.');if(o.checkoutSessionId&&o.checkoutSessionId!==sessionId&&(!reservation||o.checkoutReplacementOf!==reservation.replaces||o.checkoutAttempt!==reservation.attempt||o.checkoutSessionId!==reservation.replaces))fail(409,'An existing checkout session is already bound to this order.');o.checkoutSessionId=text(sessionId,'checkout session',240);await c.query("UPDATE stanaic_platform_workspaces SET state=$1::jsonb WHERE id='institution-live'",[JSON.stringify(s)]);await c.query('COMMIT');return {ok:true};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export async function applyPaymentEvent(pool,env,event){
 await ensurePlatformSchema(pool);const c=await pool.connect();try{
  if(event.paymentStatus!=='paid'||!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))fail(400,'Only an authoritative paid checkout event is accepted.');
  await c.query('BEGIN');const row=(await c.query("SELECT state FROM stanaic_platform_workspaces WHERE id='institution-live' AND demo=false FOR UPDATE")).rows[0];const s=row?.state;if(!s)fail(404,'Order not found.');
  const eventId=text(event.eventId,'provider event',240);if(s.paymentEvents.includes(eventId)){await c.query('COMMIT');return {ok:true,deduplicated:true}};
  const o=getItem(s.orders,event.orderId,'Order');if(o.learnerId!==event.ownerId||o.amount!==event.amountMinor||o.currency.toUpperCase()!==String(event.currency).toUpperCase())fail(409,'Payment does not match order owner, amount and currency.');
  if(!o.checkoutSessionId||o.checkoutSessionId!==event.checkoutSessionId)fail(409,'Payment does not match the order checkout session.');
  if(!['pending','paid'].includes(o.status))fail(409,'This order cannot accept a payment.');
  if(o.status==='paid'){s.paymentEvents.push(eventId);await c.query("UPDATE stanaic_platform_workspaces SET state=$1::jsonb WHERE id='institution-live'",[JSON.stringify(s)]);await c.query('COMMIT');return {ok:true,deduplicated:true}}s.paymentEvents.push(eventId);o.status='paid';o.paymentMethod='stripe';o.providerEventId=eventId;o.paymentIntent=event.paymentIntent||null;enrol(s,o);queue(s,'receipt',o.learnerId,`Payment confirmed for ${o.courseTitle}.`);audit(s,{actorId:'payment-provider',role:'finance'},'payment.confirmed',o.id,'Signed provider event reconciled and enrolment activated');
  await c.query("UPDATE stanaic_platform_workspaces SET state=$1::jsonb WHERE id='institution-live'",[JSON.stringify(s)]);await c.query('COMMIT');return {ok:true};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}

export async function getPlatformRefund(pool,identity,env,orderId){
 await ensurePlatformSchema(pool);const actor=await resolvePlatformActor(new Request('https://platform.internal'),pool,identity,env,'live');if(!['finance','superadmin'].includes(actor.role))fail(403,'A finance officer must approve refunds.');
 const c=await pool.connect();try{await c.query('BEGIN');const row=(await c.query("SELECT state FROM stanaic_platform_workspaces WHERE id='institution-live' AND demo=false FOR UPDATE")).rows[0];const s=row?.state;const o=s?.orders?.find(o=>o.id===orderId);if(!o)fail(404,'Refund order not found.');if(!o.refundRequested||o.status!=='paid')fail(409,'A pending learner refund request on a paid order is required.');if(!o.paymentIntent||o.paymentMethod!=='stripe')fail(409,'This order has no reconciled Stripe payment intent.');
 if(!o.refundApprovedBy){o.refundApprovedBy=actor.actorId;o.refundApprovedAt=Date.now();o.refundRequestKey='stanaic-refund-'+o.id;o.refundStatus='approved_for_provider';audit(s,actor,'refund.approved',o.id,'Finance approved a full refund; durable provider request key reserved');await c.query("UPDATE stanaic_platform_workspaces SET state=$1::jsonb WHERE id='institution-live'",[JSON.stringify(s)])}
 await c.query('COMMIT');return {id:o.id,orderId:o.id,paymentIntent:o.paymentIntent,amountMinor:o.amount,currency:o.currency,ownerId:o.learnerId,status:o.status,refundStatus:o.refundStatus||'requested',providerRefundId:o.providerRefundId||null,idempotencyKey:o.refundRequestKey};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export async function setPlatformRefundPending(pool,identity,env,orderId,providerRefundId){
 await getPlatformRefund(pool,identity,env,orderId);const actor=await resolvePlatformActor(new Request('https://platform.internal'),pool,identity,env,'live');const c=await pool.connect();try{
  await c.query('BEGIN');const row=(await c.query("SELECT state FROM stanaic_platform_workspaces WHERE id='institution-live' AND demo=false FOR UPDATE")).rows[0];const s=row?.state;const o=getItem(s?.orders||[],orderId,'Order');if(o.status!=='paid'||!o.refundRequested)fail(409,'Refund is no longer awaiting finance approval.');if(o.providerRefundId&&o.providerRefundId!==providerRefundId)fail(409,'A different provider refund is already bound to this order.');o.providerRefundId=text(providerRefundId,'provider refund',240);o.refundStatus='pending_provider';o.refundApprovedBy=actor.actorId;o.refundApprovedAt=Date.now();audit(s,actor,'refund.submitted',o.id,'Finance approved full refund; awaiting signed provider confirmation');await c.query("UPDATE stanaic_platform_workspaces SET state=$1::jsonb WHERE id='institution-live'",[JSON.stringify(s)]);await c.query('COMMIT');return {ok:true};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export async function applyRefundEvent(pool,env,event){
 await ensurePlatformSchema(pool);const c=await pool.connect();try{
  if(!['refund.created','refund.updated','refund.failed'].includes(event.type))fail(400,'Unsupported refund event.');
  await c.query('BEGIN');const row=(await c.query("SELECT state FROM stanaic_platform_workspaces WHERE id='institution-live' AND demo=false FOR UPDATE")).rows[0];const s=row?.state;if(!s)fail(404,'Refund order not found.');const eventId=text(event.eventId,'provider event',240);if(s.paymentEvents.includes(eventId)){await c.query('COMMIT');return {ok:true,deduplicated:true}};
  const o=getItem(s.orders,event.orderId,'Order');if(!o.providerRefundId||o.providerRefundId!==event.providerRefundId||o.paymentIntent!==event.paymentIntent||o.amount!==event.amountMinor||o.currency.toUpperCase()!==String(event.currency).toUpperCase())fail(409,'Refund does not match the approved provider reference, intent, amount and currency.');
  if(!o.refundApprovedBy||!o.refundRequested)fail(409,'Finance approval is required for this refund.');
  s.paymentEvents.push(eventId);if(o.status==='refunded'){if(['failed','canceled'].includes(event.status)){o.refundStatus=event.status;audit(s,{actorId:'payment-provider',role:'finance'},'refund.failed_after_confirmation',o.id,'Provider reported refund failure after confirmation; entitlement remains withdrawn pending finance reconciliation');queue(s,'finance_exception','finance',`Refund for order ${o.id} changed to ${event.status} after confirmation; reconcile with the provider before changing entitlement.`)}await c.query("UPDATE stanaic_platform_workspaces SET state=$1::jsonb WHERE id='institution-live'",[JSON.stringify(s)]);await c.query('COMMIT');return {ok:true,deduplicated:!['failed','canceled'].includes(event.status)}}
  o.refundStatus=event.status;if(event.status==='succeeded'){
   o.status='refunded';o.refundedAt=Date.now();s.enrolments.filter(e=>e.learnerId===o.learnerId&&e.courseId===o.courseId).forEach(e=>e.status='withdrawn');s.credentials.filter(v=>v.learnerId===o.learnerId&&v.courseId===o.courseId&&v.status==='valid').forEach(v=>{v.status='suspended';v.reason='Refund completed; registrar policy review required.'});queue(s,'refund',o.learnerId,`Full refund confirmed for ${o.courseTitle}.`);audit(s,{actorId:'payment-provider',role:'finance'},'refund.confirmed',o.id,'Signed provider confirmation; entitlement withdrawn and credential flagged for registrar review');
   for(const credential of s.credentials)await c.query('INSERT INTO stanaic_platform_credentials(id,workspace_id,record,demo,expires_at) VALUES($1,$2,$3::jsonb,false,NULL) ON CONFLICT(id) DO UPDATE SET record=excluded.record',[credential.id,'institution-live',JSON.stringify(credential)]);
  }else if(['failed','canceled'].includes(event.status))audit(s,{actorId:'payment-provider',role:'finance'},'refund.failed',o.id,'Refund failed or cancelled; entitlement retained for finance reconciliation');
  await c.query("UPDATE stanaic_platform_workspaces SET state=$1::jsonb WHERE id='institution-live'",[JSON.stringify(s)]);await c.query('COMMIT');return {ok:true};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}

export async function reservePlatformCheckoutAttempt(pool,identity,env,orderId,expiredSessionId){
 await ensurePlatformSchema(pool);const actor=await resolvePlatformActor(new Request('https://platform.internal'),pool,identity,env,'live');const c=await pool.connect();try{
  await c.query('BEGIN');const row=(await c.query("SELECT state FROM stanaic_platform_workspaces WHERE id='institution-live' AND demo=false FOR UPDATE")).rows[0];const s=row?.state;const o=getItem(s?.orders||[],orderId,'Order');if(o.learnerId!==actor.actorId)fail(403,'This order belongs to another account.');if(o.status!=='pending')fail(409,'Order is not awaiting payment.');if(o.checkoutSessionId!==expiredSessionId)fail(409,'Checkout session changed; refresh before trying again.');
  if(o.checkoutReplacementOf!==expiredSessionId){o.checkoutAttempt=(o.checkoutAttempt||0)+1;o.checkoutReplacementOf=expiredSessionId;await c.query("UPDATE stanaic_platform_workspaces SET state=$1::jsonb WHERE id='institution-live'",[JSON.stringify(s)])}
  await c.query('COMMIT');return {attempt:o.checkoutAttempt,replaces:expiredSessionId,checkoutRequestKey:'stanaic-checkout-'+o.id+'-'+o.checkoutAttempt};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
