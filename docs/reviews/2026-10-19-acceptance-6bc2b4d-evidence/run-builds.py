import pathlib,subprocess,json,re
root=pathlib.Path.cwd();e=root/'docs/reviews/2026-10-19-acceptance-6bc2b4d-evidence';w=pathlib.Path(json.loads((e/'scratch.json').read_text())['mutation']);rows=[]
def run(name,cmd,cwd=w):
 with (e/(name+'.txt')).open('w') as f:r=subprocess.run(cmd,cwd=cwd,stdout=f,stderr=subprocess.STDOUT)
 rows.append({'name':name,'command':cmd,'cwd':str(cwd),'exit':r.returncode});(e/'build-exits.json').write_text(json.dumps(rows,indent=2)+'\n');print(name,r.returncode,flush=True)
def html(name):
 s=(w/'dist/index.html').read_text();(e/(name+'.html')).write_text(s)
run('clean-build',['npm','run','build:clean']);html('clean-build-index')
run('budget-one',['npm','run','build:clean','--','--budget','1'])
run('pages-before',['git','ls-remote','origin','gh-pages'])
run('deploy-dry',['npm','run','deploy']);html('deploy-pages-index')
run('pages-after',['git','ls-remote','origin','gh-pages'])
run('deploy-domain-dry',['npm','run','deploy','--','--domain','cafe.example.com']);html('deploy-domain-index')
run('pages-after-domain',['git','ls-remote','origin','gh-pages'])
run('release-check',['npm','run','release:check'])
print('BUILDS FINISHED',flush=True)
