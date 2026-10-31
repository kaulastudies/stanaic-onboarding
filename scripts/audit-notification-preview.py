"""Verify nonempty hosted outbox preview, without sending email."""
import pathlib,json
prefix=pathlib.Path('scripts/audit-workflows.py').read_text().split("req('Public catalogue'")[0]
exec(prefix.replace('docs/audit-workflows.json','docs/audit-notifications.json'))
results=[]
req('Create notification sandbox','/api/platform/demo/start','POST',{},201)
role('courseadmin');act('Set demo fee before enrolment','updateCourse',{'courseId':'agent-control-foundations','price':100})
role('learner');d=act('Create demo order','createOrder',{'courseId':'agent-control-foundations'});order=d['orderId']
role('finance');act('Simulate payment generates receipt','simulatePayment',{'orderId':order,'eventId':'audit-notification-only'})
role('admin');req('Nonempty preview captures receipt without email','/api/platform/notifications/process?mode=demo','POST',{'mode':'demo','limit':10},200,lambda d,r:d['considered']==1 and d['configuration']['mode']=='preview' and len(d['items'])==1 and d['items'][0]['status']=='preview' and d['items'][0]['attempts']==0 and not d['items'][0]['providerAccepted'])
req('Repeat preview does not requeue or send','/api/platform/notifications/process?mode=demo','POST',{'mode':'demo','limit':10},200,lambda d,r:d['considered']==0 and d['items'][0]['status']=='preview')
act('Reset notification sandbox','resetDemo');save()
