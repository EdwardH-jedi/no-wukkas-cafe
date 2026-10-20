from pathlib import Path
import json,hashlib
p=Path(__file__).parent
refs=['3aa0828-parent','6bc2b4d','932563d-parent']
def table(file):
 return { (parts[0],parts[1]):parts[2:] for line in file.read_text().splitlines() if line.startswith(('| novice |','| average |','| expert |')) for parts in [[x.strip() for x in line.strip('|').split('|')]] }
tables={r:table(p/f'balance3-{r}.txt') for r in refs}
files={r:(p/f'balance3-{r}.csv').read_bytes() for r in refs}
out={'seeds3':{'csvIdentical':len(set(files.values()))==1,'csvBytes':{r:len(b) for r,b in files.items()},'sha256':{r:hashlib.sha256(b).hexdigest() for r,b in files.items()},'firstTryPercent':{profile:[tables['6bc2b4d'][(profile,day)][0] for day in ['Monday','Tuesday','Wednesday','Thursday','Friday']] for profile in ['novice','average','expert']},'all15TableRowsEqual':all(t==tables[refs[0]] for t in tables.values())}}
for ref in ['14827e0','7586668']:
 before=p/f'balance30-{ref}-parent.txt';after=p/f'balance30-{ref}.txt'
 if not after.exists() or not table(after):continue
 a,b=table(before),table(after);columns=['firstTry','walkoutsMeanMax','satisfaction','tips','serveSeconds','eventsPerShift','misheardFields','tries']
 out[ref]={'seeds':30,'changedRoundedRows':[{'profile':key[0],'day':key[1],'changes':{columns[i]:{'before':x,'after':y} for i,(x,y) in enumerate(zip(a[key],b[key])) if x!=y}} for key in a if a[key]!=b[key]],'firstTryWalkoutsTriesIdentical':all(all(a[k][i]==b[k][i] for i in [0,1,7]) for k in a)}
(p/'balance-comparison.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
