"""Hosted invitation-email entry regression; isolated fictional demo records only."""
import pathlib, urllib.parse
prefix=pathlib.Path('scripts/audit-workflows.py').read_text().split("req('Public catalogue'")[0]
exec(prefix.replace('docs/audit-workflows.json','docs/audit-member-email.json'))

def demo(label,path,data=None,expected=200,check=None):
 return req(label,'/api/demo/'+path,'POST' if data is not None else 'GET',data,expected,check)

demo('Invitation email opens seeded member session','member-login',{'email':'member@example.org'},check=lambda d,r:d.get('role')=='member' and d.get('next')=='/demo/member')
demo('Email-entry member sees own invitation','member/profile',check=lambda d,r:d.get('email')=='member@example.org' and d.get('id')=='demo-member')
demo('Email entry grants no demo administrator role','admin/dashboard',expected=401)
req('Email entry grants no live administrator session','/api/admin/dashboard',expected=401)
demo('Unknown sample email rejected','member-login',{'email':'unknown-regression@example.org'},404)
demo('Unknown email does not replace existing member identity','member/profile',check=lambda d,r:d.get('email')=='member@example.org')
demo('Real email domain rejected in fictional email entry','member-login',{'email':'audit@invalid.test'},400)
demo('Original member username remains compatible','login',{'username':'demo-member','password':'MemberDemo2026!'},check=lambda d,r:d.get('role')=='member')
demo('Open isolated demo admin for invitation creation','login',{'username':'demo-admin','password':'AdminDemo2026!'})
d=demo('Create new fictional member invitation','admin/invite',{'name':'Synthetic Invitation Regression','email':'misra-regression@example.org','designation':'Synthetic approved programme','requestKey':'email-entry-regression'})
member_id=d['id']
demo('Exact new invitation email opens correct member','member-login',{'email':'misra-regression@example.org'},check=lambda d,r:d.get('role')=='member')
demo('New email entry is scoped to its own invited record','member/profile',check=lambda d,r:d.get('id')==member_id and d.get('email')=='misra-regression@example.org' and d.get('designation')=='Synthetic approved programme')
demo('Entered contact email and requested role persist','member/submit',{'name':'Synthetic Invitation Regression','country':'India','expertise':'AI assurance','contactEmail':'misra-contact@example.org','requestedDesignation':'Requested Synthetic Programme','consent':True})
demo('Admin assigns reviewed designation after member request','admin/member/update',{'id':member_id,'designation':'Reviewed Synthetic Programme'})
demo('Admin approves entered-email member record','admin/review',{'id':member_id,'status':'approved','feedback':'Temporary synthetic regression completed.'})
demo('Member sees reviewed designation with invitation identity preserved','member/profile',check=lambda d,r:d.get('status')=='approved' and d.get('email')=='misra-regression@example.org' and d.get('designation')=='Reviewed Synthetic Programme' and d.get('profile',{}).get('contactEmail')=='misra-contact@example.org' and d.get('profile',{}).get('requestedDesignation')=='Requested Synthetic Programme')
demo('Reset only this regression sandbox','reset',{})
demo('Reset invalidates email-entry member session','member/profile',expected=401)
demo('Admin logs out of temporary regression sandbox','logout',{'role':'admin'})
save()
