"""Additional safe API options; uses a new isolated sandbox."""
import pathlib,json,base64
prefix=pathlib.Path('scripts/audit-workflows.py').read_text().split("req('Public catalogue'")[0]
exec(prefix.replace('docs/audit-workflows.json','docs/audit-platform-options.json'))
results=[]
req('New options sandbox','/api/platform/demo/start','POST',{},201)
act('Reject unknown role','switchRole',{'role':'nonexistent'},400)
act('Reject unknown action','nonexistent',{},403)
role('admin');act('Create synthetic membership','createMember',{'name':'Synthetic Member','email':'synthetic@example.org','designation':'Synthetic role','consent':True})
act('Approval blocked before review','approveMember',{'memberId':'sample-member'},409)
act('Announcement blocked before approval','prepareAnnouncement',{'memberId':'sample-member'},409)
role('courseadmin');act('Update course before enrolment','updateCourse',{'courseId':'agent-control-foundations','published':True,'price':100,'title':'Synthetic paid original'})
role('learner');d=act('Create invoice demo order','createOrder',{'courseId':'agent-control-foundations'});order=d['orderId']
role('finance');act('Manual invoice reconciliation in demo','manualPayment',{'orderId':order,'reference':'SYNTHETIC-ONLY-NO-TRANSFER'})
role('courseadmin');act('Reject editing enrolled course','updateCourse',{'courseId':'agent-control-foundations','price':200},409)
role('author');d=act('Submit options manuscript','submitPaper',{'title':'Synthetic options manuscript','abstract':'Audit only','manuscript':'Synthetic anonymous manuscript','consent':True});paper=d['state']['submissions'][0]['id']
role('editor');act('Screen options manuscript','screenPaper',{'submissionId':paper});act('Assign independent additional reviewer','assignReviewer',{'submissionId':paper,'reviewerId':'demo-extra-reviewer'});act('Reject author as reviewer','assignReviewer',{'submissionId':paper,'reviewerId':'demo-learner'},409)
# Original cookie-backed isolated sandbox does not accept missing or cross-site origins.
old=s.headers['Origin'];s.headers['Origin']='https://example.org';act('Cross-origin action rejected','switchRole',{'role':'admin'},403);s.headers['Origin']=old
role('superadmin');act('Reset options sandbox','resetDemo')
save()
