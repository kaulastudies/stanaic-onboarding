"""Read-only clean URL/legacy redirect regression; BASE_URL selects a preview."""
import os,json,urllib.request,urllib.error
base=os.environ.get('BASE_URL','https://stanaic-onboarding.vercel.app').rstrip('/')
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args):return None
opener=urllib.request.build_opener(NoRedirect)
rows=[]
for name in ['index','institution','research','journal','learning','membership','governance','network','architecture']:
 clean='/' if name=='index' else '/partnerships' if name=='network' else '/'+name
 with urllib.request.urlopen(base+clean,timeout=30) as r:
  body=r.read().decode();assert r.status==200 and '<title>' in body and '.html' not in r.url.split('?',1)[0];rows.append({'path':clean,'status':r.status,'final':r.url,'passed':True})
 for old in ['/institutional/'+name+'.html','/'+name+'.html','/institutional/'+name]:
  try:r=opener.open(base+old+'?audit=1',timeout=30)
  except urllib.error.HTTPError as e:r=e
  location=r.headers.get('Location','');passed=r.code==308 and location.endswith(clean+'?audit=1');rows.append({'path':old,'status':r.code,'location':location,'passed':passed});assert passed,rows[-1]
print(json.dumps({'base':base,'tests':rows,'passed':sum(r['passed'] for r in rows)},indent=2))
