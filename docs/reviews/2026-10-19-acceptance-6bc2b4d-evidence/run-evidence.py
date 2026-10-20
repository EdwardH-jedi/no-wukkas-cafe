import subprocess,pathlib,json,tempfile,os,shutil,re
root=pathlib.Path.cwd();e=root/'docs/reviews/2026-10-19-acceptance-6bc2b4d-evidence';base=pathlib.Path(tempfile.mkdtemp(prefix='nwc-acceptance-archives-'));rows=[];archives={}
def run(name,cmd,cwd=root,env=None):
 with (e/(name+'.txt')).open('w') as f:r=subprocess.run(cmd,cwd=cwd,stdout=f,stderr=subprocess.STDOUT,env=env)
 rows.append({'name':name,'command':cmd,'cwd':str(cwd),'exit':r.returncode});(e/'commands.json').write_text(json.dumps(rows,indent=2)+'\n');print(name,r.returncode,flush=True);return r.returncode
def archive(ref):
 if ref in archives:return archives[ref]
 d=base/ref.replace('^','-parent');d.mkdir();a=subprocess.run(['git','archive',ref],cwd=root,capture_output=True,check=True);subprocess.run(['tar','-x','-C',str(d)],input=a.stdout,check=True);(d/'node_modules').symlink_to(root/'node_modules',target_is_directory=True);archives[ref]=d
 (e/'archives.json').write_text(json.dumps({k:str(v) for k,v in archives.items()},indent=2)+'\n');return d
run('browser-expanded',['npx','vitest','run','tests/review/independentAcceptanceBrowser.test.ts','--reporter=verbose'])
run('new-typecheck',['npm','run','typecheck'])
run('voice-files',['npm','run','voices:check'])
run('rush-trace',['node','--import','./tests/review/nodeReviewLoader.mjs','tests/review/recomputeRushTrace.ts'])
run('event-rates',['npx','vitest','run','tests/review/independentFuzz.test.ts','tests/review/independentSlowAudio.test.ts','--reporter=verbose'],env={**os.environ,'REVIEW_EVIDENCE_DIR':str(e/'rates')})
run('task-verifiers',['npx','vitest','run','tests/core/regularAffinity.test.ts','tests/core/week/progress.test.ts','tests/review/independentSuspendedCancellation.test.ts','tests/review/independentKeys.test.ts','tests/review/independentPausedCaptions.test.ts','tests/audio/manager.test.ts','tests/scripts/indexMeta.test.ts','tests/scripts/deploy.test.ts','tests/sim/telemetrySummary.test.ts','tests/review/independentM3.test.ts','tests/review/independentM4.test.ts','tests/sim/scores.test.ts','tests/core/save/scores.test.ts','tests/app/scores.test.ts','tests/ui/scores.test.ts','tests/ui/screens.test.ts','tests/ui/shiftReport.test.ts','tests/sim/owner.test.ts','tests/data/voice.test.ts','--reporter=verbose'])
run('summary-sample',['npm','run','playtest:summary','--','tests/fixtures/telemetry/sample.json'])
run('summary-duplicate',['npm','run','playtest:summary','--','tests/fixtures/telemetry/sample.json','tests/fixtures/telemetry/sample.json'])
for name,data in [('empty',{'version':1,'records':[]}),('version',{'version':2,'records':[]}),('corrupt',{'version':1,'records':[None]})]:
 p=e/('summary-'+name+'.json');p.write_text(json.dumps(data)+'\n');run('summary-'+name,['npm','run','playtest:summary','--',str(p)])
# Historical unit totals use each named tree, rather than mislabelling current counts as old ones.
for ref in ['8333240','ef9071d','4d33c22','b78c3a4','4c4d72d','c05d257','8320cad','4282cf1']:
 run('historical-unit-'+ref,['npm','test'],archive(ref))
# The user-specified pair, plus the actual pre-visits implementation boundary.
for ref in ['3aa0828^','6bc2b4d','932563d^']:
 run('balance3-'+ref.replace('^','-parent'),['npm','run','balance','--','--seeds','3','--out',str(e/('balance3-'+ref.replace('^','-parent')+'.csv'))],archive(ref))
# Recompute the Phase 6 before/after event and affinity balance rows.
for ref in ['14827e0^','14827e0','7586668^','7586668']:
 run('balance30-'+ref.replace('^','-parent'),['npm','run','balance','--','--out',str(e/('balance30-'+ref.replace('^','-parent')+'.csv'))],archive(ref))
print('EVIDENCE FINISHED',flush=True)
