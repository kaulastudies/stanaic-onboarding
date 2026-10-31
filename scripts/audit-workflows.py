"""Live synthetic-only API audit. No credentials, payments, email or social publishing."""
import json,time,base64,pathlib,urllib.parse,http.client,ssl,os,http.cookies
class Session:
 def __init__(self):
  self.headers={};self.cookies={};self.connection=None
 def request(self,method,url,json=None,timeout=45):
  import json as j
  u=urllib.parse.urlparse(url)
  if not self.connection:
   proxy=urllib.parse.urlparse(os.environ['HTTPS_PROXY']); self.connection=http.client.HTTPSConnection(proxy.hostname,proxy.port,timeout=timeout);self.connection.set_tunnel(u.hostname,443)
  hdr={**self.headers,'Cookie':'; '.join(k+'='+v for k,v in self.cookies.items())}
  body=j.dumps(json).encode() if json is not None else None
  self.connection.request(method,u.path+('?' +u.query if u.query else ''),body=body,headers=hdr)
  r=self.connection.getresponse()
  for k,v in r.getheaders():
   if k.lower()=='set-cookie':
    c=http.cookies.SimpleCookie();c.load(v)
    for k,v in c.items():self.cookies[k]=v.value
  class Response:
   def __init__(self,r):self.status_code=r.status;self.content=r.read();self.text=self.content.decode(errors='replace')
   def json(self):return j.loads(self.text)
  return Response(r)
BASE='https://stanaic-onboarding.vercel.app'
s=Session();s.headers.update({'Origin':BASE,'Content-Type':'application/json'})
results=[]
def req(label,path,method='GET',data=None,expected=200,check=None):
 try:
  r=s.request(method,BASE+path,json=data,timeout=45)
  try:d=r.json()
  except:d={'text':r.text[:200]}
  ok=r.status_code in ([expected] if isinstance(expected,int) else expected)
  if ok and check:ok=bool(check(d,r))
  results.append({'test':label,'method':method,'path':path,'status':r.status_code,'expected':expected,'passed':ok,'error':d.get('error') if isinstance(d,dict) else None})
  print(label,r.status_code,'PASS' if ok else 'FAIL',flush=True)
  save();return d
 except Exception as e:
  results.append({'test':label,'path':path,'passed':False,'blocked':str(e)});print(label,'BLOCKED',str(e),flush=True);save();return {}
def save():
 pathlib.Path('docs/audit-workflows.json').write_text(json.dumps({'base':BASE,'timestamp':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'tests':results},indent=2))
def act(label,action,payload={},expected=200):return req(label,'/api/platform/action?mode=demo','POST',{'mode':'demo','action':action,'payload':payload},expected)
def role(r):return act('Switch role '+r,'switchRole',{'role':r})
req('Public catalogue','/api/platform/catalogue',check=lambda d,r:'courses'in d)
req('Unauthenticated live state denied','/api/platform/state',expected=401)
req('Unauthenticated demo state denied','/api/platform/state?mode=demo',expected=401)
d=req('Create isolated sandbox','/api/platform/demo/start','POST',{},201)
assert d.get('state'),d
req('Read own sandbox','/api/platform/state?mode=demo',check=lambda d,r:'answerKeys'not in d['state'])
for r in ['superadmin','admin','maintainer','courseadmin','assessor','registrar','editor','reviewer','finance','content','auditor','learner','author']:
 role(r)
role('learner');act('Learner denied course creation','createCourse',{},403);act('Learner denied member approval','approveMember',{'memberId':'sample-member'},403)
act('Save learner profile','updateProfile',{'name':'Synthetic Audit Learner','bio':'Temporary workflow audit','linkedinUrl':'','publicCredentialNameConsent':False})
act('Reject assessment without enrolment','submitAssessment',{'courseId':'agent-control-foundations','answers':[1,0,2,1,0]},409)
act('Enrol free course','createOrder',{'courseId':'agent-control-foundations'})
act('Reject assessment before lesson completion','submitAssessment',{'courseId':'agent-control-foundations','answers':[1,0,2,1,0]},409)
for lesson in ['authority','evidence','revalidation']:act('Complete lesson '+lesson,'completeLesson',{'courseId':'agent-control-foundations','lessonId':lesson})
act('Record failing assessment','submitAssessment',{'courseId':'agent-control-foundations','answers':[0,1,0,0,1]})
d=act('Record passing assessment','submitAssessment',{'courseId':'agent-control-foundations','answers':[1,0,2,1,0]});attempt=d['state']['attempts'][0]['id']
act('Reject duplicate passing assessment','submitAssessment',{'courseId':'agent-control-foundations','answers':[1,0,2,1,0]},409)
role('assessor');act('Independent assessment approval','approveAssessment',{'attemptId':attempt,'feedback':'Synthetic test evidence reviewed.'})
role('registrar');d=act('Issue unsigned demo credential','issueCredential',{'attemptId':attempt});cred=d.get('credentialId') or d['state']['credentials'][0]['id']
req('Public credential verification with withheld identity','/api/platform/verify/'+cred,check=lambda d,r:d['credential']['learnerName']=='Identity withheld' and d['signatureVerified'] is None)
act('Reject duplicate issuance','issueCredential',{'attemptId':attempt},409)
act('Revoke demo credential','revokeCredential',{'credentialId':cred,'reason':'Synthetic audit completed'})
req('Public revocation visible','/api/platform/verify/'+cred,check=lambda d,r:d['credential']['status']=='revoked')
role('author');d=act('Submit anonymised manuscript','submitPaper',{'title':'Synthetic audit manuscript','abstract':'Audit-only abstract','manuscript':'Anonymised synthetic content for workflow checks.','consent':True,'declarations':'No conflicts; temporary audit.'});paper=d['state']['submissions'][0]['id']
f={'mode':'demo','submissionId':paper,'name':'audit.txt','base64':base64.b64encode(b'Synthetic anonymous manuscript.').decode(),'anonymised':True}
d=req('Upload private manuscript','/api/platform/files/upload?mode=demo','POST',f,201);fileid=d['id']
req('Duplicate file idempotency','/api/platform/files/upload?mode=demo','POST',f,200,lambda d,r:d.get('duplicate') is True)
req('Author attachment list','/api/platform/files/list?mode=demo&submissionId='+paper,check=lambda d,r:d['items'][0]['name']=='audit.txt')
role('reviewer');req('Unassigned reviewer attachment denied','/api/platform/files/download/'+fileid+'?mode=demo',expected=403)
role('editor');act('Reject publication before reviews','publishPaper',{'submissionId':paper},409);act('Editorial screening','screenPaper',{'submissionId':paper})
role('reviewer');req('Assigned reviewer attachment anonymised','/api/platform/files/list?mode=demo&submissionId='+paper,check=lambda d,r:d['items'][0]['name']=='Anonymised manuscript v1')
req('Assigned reviewer private download','/api/platform/files/download/'+fileid+'?mode=demo',check=lambda d,r:r.content==b'Synthetic anonymous manuscript.')
act('Reject review without conflict declaration','reviewPaper',{'submissionId':paper,'notes':'Audit review','recommendation':'revise'},400)
act('Independent review requesting revision','reviewPaper',{'submissionId':paper,'notes':'Synthetic revision test.','recommendation':'revise','noConflict':True})
role('editor');act('Editorial revision request','decidePaper',{'submissionId':paper,'decision':'revision_requested','note':'Synthetic revision.'})
role('author');act('Author revision','revisePaper',{'submissionId':paper,'manuscript':'Revised anonymous synthetic manuscript.'})
role('editor');act('Rescreen revision','screenPaper',{'submissionId':paper})
role('reviewer');act('Independent acceptance review','reviewPaper',{'submissionId':paper,'notes':'Synthetic revision checked.','recommendation':'accept','noConflict':True})
role('editor');act('Editorial acceptance','decidePaper',{'submissionId':paper,'decision':'accepted','note':'Synthetic acceptance.'});act('Reject publication before author proof','publishPaper',{'submissionId':paper},409)
role('author');act('Author approves proof','approveProof',{'submissionId':paper,'consent':True,'licence':'Synthetic demonstration only'})
role('editor');act('Publish in isolated demo catalogue','publishPaper',{'submissionId':paper})
role('courseadmin');d=act('Create paid synthetic course','createCourse',{'title':'Synthetic Audit Course','summary':'Temporary demonstration course','price':100,'currency':'INR','version':'1','published':True,'lessons':[{'title':'Synthetic lesson','body':'Temporary material'}],'questions':[{'prompt':'Audit question','options':['Correct','Incorrect'],'answerIndex':0}]});course=d['state']['courses'][-1]['id']
# Find by title rather than collection ordering.
course=next(c['id'] for c in d['state']['courses'] if c['title']=='Synthetic Audit Course')
act('Update unpublished enrolment-free course','updateCourse',{'courseId':course,'title':'Synthetic Audit Course','price':100,'published':True})
role('learner');d=act('Create pending paid demo order','createOrder',{'courseId':course});order=next(o['id']for o in d['state']['orders']if o['courseId']==course)
act('Paid content locked before payment','completeLesson',{'courseId':course,'lessonId':'lesson-1'},403)
role('finance');act('Simulate payment in demo only','simulatePayment',{'orderId':order,'eventId':'synthetic-audit-event'})
role('learner');act('Paid lesson unlocked after demo payment','completeLesson',{'courseId':course,'lessonId':'lesson-1'});act('Request demo refund','requestRefund',{'orderId':order,'reason':'Synthetic audit'})
role('finance');act('Approve simulated refund','approveRefund',{'orderId':order})
role('learner');act('Content withdrawn after refund','completeLesson',{'courseId':course,'lessonId':'lesson-1'},403)
role('maintainer');act('Review sample membership','reviewMember',{'memberId':'sample-member','note':'Synthetic review'})
role('admin');act('Approve sample membership','approveMember',{'memberId':'sample-member'});act('Update approved member designation','updateMember',{'memberId':'sample-member','designation':'Synthetic Audit Member','linkedinUrl':''});act('Prepare announcement draft only','prepareAnnouncement',{'memberId':'sample-member'})
role('content');act('Add synthetic research resource','publishResource',{'title':'Synthetic Audit Resource','url':'https://example.org/audit','type':'Research','summary':'Temporary demonstration only'})
role('auditor');act('Read-only auditor mutation denied','publishResource',{'title':'Denied','url':'https://example.org'},403)
role('admin');req('Notification delivery status','/api/platform/notifications/status?mode=demo')
req('Process synthetic notifications with preview transport','/api/platform/notifications/process?mode=demo','POST',{'mode':'demo','limit':10},200,lambda d,r:bool(d))
req('Notification status after processing','/api/platform/notifications/status?mode=demo')
role('learner');req('Learner notification processing denied','/api/platform/notifications/process?mode=demo','POST',{'mode':'demo','limit':10},403)
role('superadmin');act('Demo role grants blocked','grantRole',{'email':'audit@example.org','role':'admin'},409)
# Reset only our synthetic workspace and verify no public sample credential remains.
act('Reset own synthetic workspace','resetDemo')
req('Reset removes public demo credential','/api/platform/verify/'+cred,expected=404)
save()
