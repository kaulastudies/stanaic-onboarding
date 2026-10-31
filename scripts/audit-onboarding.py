"""Original onboarding sandbox audit; no email is sent."""
import pathlib,json,urllib.parse
prefix=pathlib.Path('scripts/audit-workflows.py').read_text().split("req('Public catalogue'")[0]
exec(prefix.replace("docs/audit-workflows.json", "docs/audit-onboarding.json"))
results=[]
def demo(label,path,data=None,expected=200):return req(label,'/api/demo/'+path,'POST' if data is not None else 'GET',data,expected)
demo('Original demo admin login','login',{'username':'demo-admin','password':'AdminDemo2026!'})
d=demo('Original demo dashboard','admin/dashboard');member=d['members'][0]['id']
d=demo('Read protected demonstration outbox','admin/mail');mail=d['items'][0]['id']
d=demo('Read invitation preview','admin/mail/preview?id='+mail);token=urllib.parse.parse_qs(urllib.parse.urlparse(d['link']).fragment)['token'][0]
demo('Exchange single-use invitation','member/exchange',{'token':token})
demo('Reject reused invitation','member/exchange',{'token':token},410)
demo('Read own member profile','member/profile')
demo('Consent required on onboarding submission','member/submit',{'name':'Synthetic Audit Member','country':'India','expertise':'AI assurance'},400)
demo('Submit onboarding details','member/submit',{'name':'Synthetic Audit Member','country':'India','expertise':'AI assurance','affiliation':'Synthetic','bio':'Temporary audit','portfolio':'https://example.org','consent':True,'contactEmail':'audit@example.org','requestedDesignation':'Requested synthetic role'})
demo('Reject duplicate onboarding submission','member/submit',{'name':'Synthetic Audit Member','country':'India','expertise':'AI assurance','consent':True},409)
demo('Admin reads submitted member','admin/member?id='+member)
demo('Admin updates approved designation','admin/member/update',{'id':member,'designation':'Synthetic reviewed designation'})
demo('Admin approves onboarding','admin/review',{'id':member,'status':'approved','feedback':'Synthetic audit review'})
demo('Member reads approved status','member/profile')
demo('Create synthetic invitation','admin/invite',{'name':'Second Synthetic Member','email':'second@example.org','designation':'Synthetic role','requestKey':'audit-request-key'})
d=demo('Idempotent invitation retry','admin/invite',{'name':'Second Synthetic Member','email':'second@example.org','designation':'Synthetic role','requestKey':'audit-request-key'});second=d['id']
demo('Reject duplicate active invite email','admin/invite',{'name':'Second Synthetic Member','email':'second@example.org','designation':'Synthetic role','requestKey':'audit-new-key'},409)
demo('Renew invitation','admin/renew',{'id':second});demo('Revoke invitation','admin/revoke',{'id':second})
demo('Reject arbitrary real email in demo','admin/invite',{'name':'Synthetic','email':'audit@invalid.test','designation':'Role','requestKey':'blocked-email'},400)
demo('Add synthetic staff','admin/team',{'email':'staff@example.org','role':'maintainer'})
d=demo('List synthetic staff','admin/team');staff=d['staff'][0]['id']
demo('Remove synthetic staff','admin/team/remove',{'id':staff})
demo('Reset own original demo workspace','reset',{})
demo('Reset invalidates member session','logout',{'role':'member'},401);demo('Demo logout admin','logout',{'role':'admin'})
pathlib.Path('docs/audit-onboarding.json').write_text(json.dumps({'base':BASE,'tests':results},indent=2))
