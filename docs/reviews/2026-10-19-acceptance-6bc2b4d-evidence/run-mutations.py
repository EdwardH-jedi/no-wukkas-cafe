import pathlib,subprocess,json,shutil
root=pathlib.Path.cwd(); e=root/'docs/reviews/2026-10-19-acceptance-6bc2b4d-evidence'; w=pathlib.Path(json.loads((e/'scratch.json').read_text())['mutation'])
rows=[]
def run(name,cmd):
 with (e/(name+'.txt')).open('w') as f: p=subprocess.run(cmd,cwd=w,shell=True,stdout=f,stderr=subprocess.STDOUT)
 return p.returncode
cases=[
 ('T2.2','src/core/rush/serve.ts','regularServed(r, c, result.correct);','if (result.correct) regularServed(r, c, result.correct);','npx vitest run tests/core/regularAffinity.test.ts',None),
 ('T2.3','src/core/week/progress.ts',"status: d.index < save.shift ? 'done' : d.index === save.shift ? 'open' : 'locked',","status: bestGrade(save, d.index) ? 'done' : d.index === save.shift ? 'open' : 'locked',",'npx vitest run tests/core/week/progress.test.ts',None),
 ('T2.6','src/app/boot.ts',"from './pause';","from './pauseDuplicate';",'npx vitest run tests/review tests/core/rushTrace.test.ts && ! grep -q "copied, not shared" tests/review/harness.ts','Contracts'),
 ('T3.1','scripts/build-clean.ts',"  symlinkSync(join(ROOT, 'node_modules'), modules, 'dir');","  cpSync(join(ROOT, 'src'), join(work, 'src'), {recursive:true});\n  cpSync(join(ROOT, 'index.html'), join(work, 'index.html'));\n  symlinkSync(join(ROOT, 'node_modules'), modules, 'dir');",'npm run build:clean','Build'),
 ('T3.4','scripts/deploy.ts','NWC_BASE: site.base','NWC_BASE: "/"','npx vitest run tests/scripts/deploy.test.ts && npm run deploy','Build'),
 ('T4.1','src/sim/scores.ts',"return a.mode === 'endless' ? 0 : a.walkouts - b.walkouts;",'return 0;','npx vitest run tests/sim/scores.test.ts',None),
 ('T4.3','src/app/rushView.ts','app.scoreNote = recordScore(app.scores, r, new Date().toISOString());','app.scoreNote = null;','npx vitest run tests/app/scores.test.ts tests/ui/shiftReport.test.ts','Contracts'),
 ('T4.5','src/core/rush/machine.ts','const newBest = !!best && summaryBeats(r.summary, best);','const newBest = true;','npx vitest run tests/sim/owner.test.ts tests/data/voice.test.ts','Contracts'),
]
for task,file,old,new,cmd,guard in cases:
 p=w/file; original=p.read_bytes(); assert old in original.decode(),(task,old)
 extras=[]
 if task=='T2.6':
  extra=w/'src/app/pauseDuplicate.ts'; extra.write_bytes((w/'src/app/pause.ts').read_bytes());extras.append(extra)
 p.write_text(original.decode().replace(old,new))
 try:
  (e/('mutation-'+task+'.patch')).write_text(subprocess.run(['git','diff','--',file],cwd=w,capture_output=True,text=True).stdout)
  code=run('mutation-'+task,cmd)
  row={'task':task,'file':file,'replacement':[old,new],'verify':cmd,'exit':code}
  if task=='T3.1': row['budgetExit']=run('mutation-'+task+'-budget','npm run build:clean -- --budget 1')
  if guard:
   name='independentAcceptance'+guard+'.test.ts'; dst=w/'tests/review'/name; shutil.copyfile(root/'tests/review'/name,dst); extras.append(dst)
   row['guardExit']=run('mutation-'+task+'-guard','npx vitest run tests/review/'+name)
  rows.append(row);(e/'mutations.json').write_text(json.dumps(rows,indent=2)+'\n');print(task,row,flush=True)
 finally:
  p.write_bytes(original)
  for extra in extras: extra.unlink()
print('MUTATIONS FINISHED',flush=True)
