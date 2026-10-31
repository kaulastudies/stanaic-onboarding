"""Regression reproduction: reset should release own demo attachment quota."""
import pathlib,json,base64
prefix=pathlib.Path('scripts/audit-workflows.py').read_text().split("req('Public catalogue'")[0]
exec(prefix.replace('docs/audit-workflows.json','docs/audit-reset-attachments.json'))
results=[]
req('Create reset regression sandbox','/api/platform/demo/start','POST',{},201)
role('author');d=act('Submit reset regression manuscript','submitPaper',{'title':'Synthetic reset audit','abstract':'Audit','manuscript':'Anonymous audit','consent':True});paper=d['state']['submissions'][0]['id']
for i in range(30):
 req('Fill tiny attachment quota '+str(i+1),'/api/platform/files/upload?mode=demo','POST',{'mode':'demo','submissionId':paper,'name':'audit-'+str(i)+'.txt','base64':base64.b64encode(('Anonymous synthetic audit '+str(i)).encode()).decode(),'anonymised':True},201)
act('Reset own sandbox','resetDemo')
d=act('Submit manuscript after reset','submitPaper',{'title':'Synthetic after reset','abstract':'Audit','manuscript':'Anonymous audit','consent':True});paper=d['state']['submissions'][0]['id']
req('Attachment capacity should recover after reset','/api/platform/files/upload?mode=demo','POST',{'mode':'demo','submissionId':paper,'name':'after-reset.txt','base64':base64.b64encode(b'Anonymous after reset').decode(),'anonymised':True},201)
act('Reset regression records','resetDemo');save()
