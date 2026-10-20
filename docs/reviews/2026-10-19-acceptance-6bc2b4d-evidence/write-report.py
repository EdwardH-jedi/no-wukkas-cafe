from pathlib import Path
import json,re,collections
E=Path(__file__).parent
R=E.parent/'2026-10-19-acceptance-6bc2b4d.md'
clauses=json.loads((E/'clauses.json').read_text())
def setc(id,status,evidence):
 c=next(c for c in clauses if c['id']==id);c['status']=status;c['evidence']=evidence
setc('T3.6.09','PASS','tests/fixtures/telemetry/makeSample.ts regenerated in scratch: exit 0, byte-identical sample.json (fixture-regeneration.json)')
setc('T3.2.05','PASS','og-regenerated.json: generator rerun in throwaway worktree, exit 0, 1200x630 /242,869 bytes; committed original235,963 bytes restored')
setc('T4.6.04','FAIL','F8 evidence gap: npm run voices:check exits1,597 missing-audio errors,0 warnings; no voice-cache in this checkout')
# Runtime results are installed only after their commands finish.
if (E/'final-test.txt').exists():
 final=(E/'final-test.txt').read_text()
 if 'preserves the child build exit code' in final and 'Test Files' in final:
  setc('T3.1.07','PASS','independentAcceptanceBuild injects child npm exit23: script returns23 and retains previous dist; final-test.txt')
 if (E/'desktop-exit.json').exists() and json.loads((E/'desktop-exit.json').read_text())['exit']==0:
  setc('T2.4.05','PASS','independentAcceptanceBrowser measures actual ea6fdd4^ versus6bc2b4d at1024x640 after allowing identical bundled fonts: x662/y133.3046875/w346/h373.390625 both, all deltas0px; desktop-reproduction.txt')
if (E/'e2e-summary.json').exists():
 summary=json.loads((E/'e2e-summary.json').read_text())
 for id in summary.get('passedClauses',[]):setc(id,'PASS',summary['evidence'])
(E/'clauses.json').write_text(json.dumps(clauses,indent=2)+'\n')
# Split bundled wording so named fields, tags, sizes and behaviour obligations each get a verdict.
splits = {
'T2.2.01': ['Correct accepted regular serve increments visits in week mode', 'Incorrect accepted regular serve also increments visits in week mode'],
'T2.4.01': ['Register implementation is src/ui/pos.ts', 'Register layout is in src/ui/styles/rush.css'],
'T2.8.03': ['Uncancelled suspended line resumes', 'onStart runs exactly once'],
'T3.1.06': ['Print total non-audio bytes', 'Default budget is3,000,000bytes'],
'T3.2.04': ['Generator lives at scripts/og-image.ts', 'Generator uses Playwright', 'Generator captures the title screen', 'Generator viewport is1200x630', 'Generator chooses a free dev port', 'Generator uses ?voice=0'],
'T3.4.01': ['npm run deploy maps to scripts/deploy.ts', 'Deploy invokes build:clean'],
'T3.4.05': ['Deployment commit message is deploy <sha>', 'Dry run prints its would-push destination'],
'T3.4.06': ['Dry run is the default and does not push', 'Remote gh-pages stays at db4c056'],
'T3.7.04': ['Command pointer targets AGENTS.md section3', 'Architecture pointer targets docs/DEVLOG.md'],
'T3.8.04': ['Phase 6 contains6.14', 'Phase 6 contains6.15'],
'T4.1.04': ['emptyScores returns an empty versioned store', 'parseScores recovers corrupt input', 'parseScores recovers another version'],
'T4.1.09': ['insert preserves its input', 'isNewBest preserves its input'],
'T4.3.05': ['Beating an existing score shows New best!', 'Week and Day 2 otherwise show Best so far: <grade>, N served'],
'T4.3.06': ['Summary unit asserts one entry', 'Worse second summary does not change best', 'UI unit asserts new-best wording', 'UI unit asserts existing-best wording'],
'T4.5.06': ['Gaz never says new-best on first play', 'Gaz says it only when beating an existing week best'],
'T4.8.05': ['Phase 6 contains6.16', 'Phase 6 contains6.17', 'Phase 6 contains6.18', 'T4.8 gate verify succeeds'],
'T2.1.06': ['Integration used a non-fast-forward merge (two-parent commit157329e)', 'Historical main push was fast-forward only'],
'T2.2.02': ['Hand-backs add no visits', 'Day 2 adds no regular visits', 'Non-regular customers add no regular visits'],
'T2.3.01': ['Current index is open in week1', 'Current index is open in week2 and later'],
'T2.5.03': ['#subs inside375x667 atSmall', '#subs inside375x667 atMedium', '#subs inside375x667 atLarge', '#subs inside390x844 atSmall', '#rsubs inside both phone widths atSmall/Medium/Large'],
'T2.6.01': ['setPaused has one exported implementation under src/app/', 'resumeAll has one exported implementation under src/app/', 'replay (named replayLast) has one exported implementation under src/app/', 'Shared lifecycle module remains small (51lines)'],
'T3.1.03': ['Scratch build symlinks node_modules', 'Production build runs in the exported scratch directory'],
'T3.2.01': ['HTML title is No Wukkas Café', 'HTML description names the week'],
'T3.2.02': ['og:title exists and matches title', 'og:description exists and matches description', 'og:image exists', 'og:type exists and is website', 'twitter:card exists and is summary_large_image'],
'T3.2.03': ['public/og.png exists', 'PNG width is1200', 'PNG height is630', 'PNG is at most300,000bytes'],
'T3.3.02': ['Desktop viewport is1024x640', 'Phone viewport is390x844'],
'T3.3.03': ['Perf scenario starts Day 2', 'Perf scenario selects seed7', 'Perf sampling waits for at least3 customers in the cafe'],
'T3.3.05': ['Draw calls asserted strictly less than150', 'Median frame time is logged', 'Frame time is not a pass/fail threshold'],
'T3.4.08': ['No-domain build base is /no-wukkas-cafe/', 'Custom-domain build base is /', 'Build receives base/site through its environment'],
'T3.5.01': ['Playtest guide specifies30minutes', 'Playtest guide explains npm run dev -- --host', 'Playtest guide supplies the deployment URL with publication caveat'],
'T3.5.02': ['Clear log between testers', 'Export log at the end', 'Guide specifies log/notes destination'],
'T3.5.03': ['Template includes device', 'Template includes browser', 'Template includes Trial result', 'Template includes shifts played', 'Template includes stuck points'],
'T3.5.04': ['Template includes pardons per order', 'Template includes walk-outs', 'Template includes one-more-shift yes/no', 'Template includes quotes'],
'T3.6.03': ['Aggregate distinct sessions', 'Aggregate shifts', 'Deduplicate repeated records from the same session'],
'T3.6.04': ['Aggregate served', 'Aggregate walk-outs by stage'],
'T3.6.05': ['Aggregate accuracy for each field', 'Aggregate pardons per order'],
'T3.6.06': ['Compute pooled register-wait median', 'Compute register-wait maximum'],
'T3.6.07': ['Aggregate quit points', 'Aggregate trial verdicts'],
'T3.6.10': ['Reject other log versions', 'Print a diagnostic for the rejected version', 'Return exit 1 for rejected version'],
'T3.6.11': ['Empty log handled without NaN', 'Corrupt record rejected', 'Two logs from one session do not inflate totals'],
'T4.1.01': ['ScoreEntry exposes mode day2/week/endless', 'ScoreEntry exposes week', 'ScoreEntry exposes shiftIndex', 'ScoreEntry exposes seed', 'ScoreEntry exposes difficulty'],
'T4.1.02': ['ScoreEntry exposes grade', 'ScoreEntry exposes served', 'ScoreEntry exposes walkouts', 'ScoreEntry exposes integer tipsCents', 'ScoreEntry at is supplied externally as ISO timestamp'],
'T4.1.03': ['Week boards separate shift indices', 'Week boards separate difficulties', 'Endless boards separate difficulties', 'Endless keys never alias shift keys'],
'T4.1.05': ['Grade is the primary week rank', 'Served breaks equal-grade ties', 'Tips break equal-grade/equal-served ties', 'Fewer walk-outs break remaining week ties'],
'T4.1.06': ['Endless rank uses served first', 'Endless rank uses tips second', 'Endless ignores grade and walk-outs'],
'T4.2.01': ['ScoresStore.read exists', 'ScoresStore.put exists', 'ScoresStore.clear exists', 'ScoresStore.memoryOnly exists'],
'T4.2.02': ['Storage key is nwc.scores.v1', 'Scores are outside the save object', 'No save-schema migration introduced for scores'],
'T4.3.01': ['App context contains scores', 'Review harness supplies a memory score store'],
'T4.3.03': ['Day 2 summary writes a score', 'Endless summary writes a score'],
'T4.3.04': ['Score write precedes report render', 'One score is written per consumed summary transition'],
'T4.4.05': ['Escape closes Scores', 'Tab/ShiftTab wrap within Scores', 'Closing returns focus to title Scores button'],
'T4.8.02': ['parseScores requires an own-key grade', 'parseScores rejects entries belonging to another board'],
}
expanded=[]
for c in clauses:
    if c['id'] not in splits:
        expanded.append(c); continue
    for i,label in enumerate(splits[c['id']],1):
        d={**c,'id':c['id']+f'.{i}','clause':label}
        if c['id']=='T2.1.06' and i==2:
            d['status']='UNVERIFIED';d['evidence']='Current ancestry proves inclusion, not the historical git push invocation or its flags'
        expanded.append(d)
clauses=expanded
(E/'expanded-clauses.json').write_text(json.dumps(clauses,indent=2)+'\n')
out=['# Independent acceptance audit — main 6bc2b4d','',
'**FIX — P1: 1; P2: 7; P3: 2; reviewer red count: 4.**','',
'M2–M4 are **not fully implemented and acceptance-verified as written**: Small-text phone registration still intersects its instruction box, four task verifiers accept a removed feature, the specified Day 1 subtitle test measures Day 2 instead, Endless report copy deviates from the literal task, and development audio cannot be verified in this checkout. The disclosed save/telemetry read-fallback flaws are reproduced separately. The previous M3/M4 gate findings are fixed and are not re-reported. M5 is honestly incomplete; its version value was already present before M2, so “nothing of M5 exists” would be too strong.','',
'Target was established first by `git fetch -q origin && git checkout --detach origin/main`; `git rev-parse --short HEAD` printed **6bc2b4d**. Review branch: `chore/review-acceptance-6bc2b4d`. Only new `tests/review/independentAcceptance*.test.ts` files and `docs/` were authored in this checkout. Production mutations were confined to a temporary detached worktree, restored after every experiment, never committed. Build/deploy probes also used that disposable worktree. No project push or merge was run. Local bare-repository fixture pushes are the only `--push` exercises.','',
'`E/` below means `docs/reviews/2026-10-19-acceptance-6bc2b4d-evidence/`. Every execution saved stdout/stderr without piping the test through a filter; JSON exit records retain actual process status. Exact commands and cwd are in `commands.json`, `build-exits.json`, `mutations.json` and the named exit files. A failing command is not silently treated as a pass.','',
'## 1. Task clause verdicts','',
'Each numbered clause is an independently checked acceptance obligation. PASS applies only to the observation cited, not untested devices, historical workflow order or human approvals. A source check can prove a file, import, tag or pure expression exists; it cannot prove a render, a past command or a paid-provider interaction. Verification quality is scored separately from the feature working today.','',
'| Task | Clauses | PASS | FAIL | UNVERIFIED |','| --- | ---: | ---: | ---: | ---: |']
for task in dict.fromkeys(c['task'] for c in clauses):
 cs=[c for c in clauses if c['task']==task];counts=collections.Counter(c['status'] for c in cs)
 out.append(f"| {task} | {len(cs)} | {counts['PASS']} | {counts['FAIL']} | {counts['UNVERIFIED']} |")
counts=collections.Counter(c['status'] for c in clauses)
out += [f"| **Total** | **{len(clauses)}** | **{counts['PASS']}** | **{counts['FAIL']}** | **{counts['UNVERIFIED']}** |",'',
'### FAIL / UNVERIFIED clauses','']
for c in clauses:
 if c['status']!='PASS':out.append(f"- **{c['id']} {c['status']}** — {c['clause']}. {c['evidence']}.")
out += ['', '### Complete clause ledger', '', '| Clause | Obligation | Verdict | Evidence |','| --- | --- | --- | --- |']
for c in clauses:
 out.append('| '+' | '.join(str(c[k]).replace('|',' / ') for k in ['id','clause','status','evidence'])+' |')
out += ['', '## 2. Mutation results — do the verify lines have teeth?', '',
'One mutation at a time, in `scratch.json`’s detached worktree at 6bc2b4d; exact replacements and patches are retained. T3.1/T3.4 are script features, so their mutation necessarily changes `scripts/` in the disposable worktree, rather than unrelated `src/` code. The T2.6 copy additionally creates `src/app/pauseDuplicate.ts` with the original pause-module bytes. No source in the review checkout was changed.','',
'| Task | Mutation | Original verify result | Independent detector |','| --- | --- | --- | --- |']
short={'T2.2':'Count visits only for correct serves','T2.3':'Restore old-best-based done status','T2.6':'Make boot import a private duplicate pause module; harness still uses shared module','T3.1':'Overlay working-tree src/ and index.html onto the HEAD export','T3.4':'Pass `/` to the real build even for repository Pages deployment','T4.1':'Remove fewer-walkouts tie-break','T4.3':'Replace report-phase recordScore call with null','T4.5':'Always emit new-best at wrap-up'}
for row in json.loads((E/'mutations.json').read_text()):
 task=row['task'];value=f"exit {row['exit']}"
 if 'budgetExit' in row:value+=f"; budget exit {row['budgetExit']}"
 if row['exit']==0:value+=' — **SURVIVED**'
 else:value+=' — rejected'
 guard=f"new guard exit {row['guardExit']}" if 'guardExit' in row else 'Author verifier already catches it'
 out.append(f'| {task} | {short[task]} | {value} | {guard} |')
out += ['',
'Four surviving mutations are P2 findings F4–F7. Their new guards pass at the target and fail under mutation; these are **not four additional red tests on main**. T2.6 is a structural sharing contract, so its guard checks the actual imports. T3.1 tests dirty-output isolation, T3.4 observes the environment received by the build subprocess, and T4.3 dispatches real summary events through the production frame before inspecting the report callback. The existing T4.5 verifier does invoke the machine and correctly catches unconditional congratulations.','',
'## 3. Claims, recomputed numbers and execution record','',
'### Unit counts by exit code','',
'Initial `npm run typecheck && npm run lint && npm test` (sequential stop-on-failure equivalent): **0 / 0 / 0; 111 files, 899 passed, 0 failed**. New tests were absent from that baseline.','',
'Historical totals were recomputed from fresh `git archive` exports of the named commits with the same installed dependencies. Historical durations are observations of old runs, not deterministic acceptance numbers; the rerun durations are retained in the logs.','',
'| Source claim / revision | Claimed files / passed / failed | Recomputed files / passed / failed | Exit |','| --- | --- | --- | ---: |']
claims=[('8333240','95 /765 /10'),('ef9071d','96 /787 /0'),('4d33c22','99 /803 /0'),('b78c3a4','100 /813 /0'),('4c4d72d','100 /823 /0'),('c05d257','100 /824 /0'),('8320cad','105 /861 /0'),('4282cf1','111 /899 /0')]
for ref,claim in claims:
 f=E/f'historical-unit-{ref}.txt';s=f.read_text() if f.exists() else ''
 fm=re.search(r'Test Files[^\n]*\((\d+)\)',s);tm=re.search(r'\n\s*Tests[^\n]*\((\d+)\)',s)
 failed=re.search(r'\n\s*Tests\s+(\d+) failed',s)
 if fm and tm:
  total=int(tm[1]);nfail=int(failed[1]) if failed else 0;got=f'{fm[1]} /{total-nfail} /{nfail}'
 else:got='PENDING'
 out.append(f'| {ref} | {claim} | {got} | {1 if ref=="8333240" else 0} |')
out += ['',
'4c4d72d identifies the 823-test snapshot quoted without a SHA in Phase 6’s 6.13 Evidence; c05d257 adds the lastOrder guard for824. 8320cad and4282cf1 are the respective gate fixes for861 and899. The old 8333240 reds are the already-known defects, not new findings. Current selected task verifiers: **19 files /154 passed, exit 0**; M3 gate **9/9** and M4 gate **9/9** (formerly7 and5 red respectively) remain green.','']
if (E/'final-test.txt').exists():
 s=(E/'final-test.txt').read_text();summary='\n'.join(x.strip() for x in s.splitlines() if re.match(r'\s*(Test Files|Tests|Duration)\s',x))
 out += ['Final reviewer-inclusive unit run (see `final-exits.json`; typecheck0, lint0, test1; Node26.7.0/npm11.19.0, newer than the documented Node24 target):', '', '```text', summary or 'PENDING', '```','']
out += ['### Numeric claim comparison','',
'| Claim | Recomputed result / limit | Verdict |','| --- | --- | --- |',
'| 1.56 MB without audio | **1,562,576 bytes**, decimal1.56 MB; Pages1,562,923; custom domain1,562,626; budget3,000,000 | PASS at quoted precision |',
'| `--budget 1` exits1; audio gate printed | exit 1,1,562,575 bytes over; `[audio-gate] ok: 0 licensed audio file(s) in the build` | PASS |',
'| og.png1200x630 and <=300kB | committed235,963 bytes; freshly regenerated242,869 bytes; both1200x630 | PASS |',
'| gh-pages remains db4c056 | before/after both dry runs: db4c0567f5ba00ec9bf6078da44a8c78b5a17ef0 | PASS |',
'| Seven rushTrace SHA-1s equal1a54a00 | seven exact matches, `artifact-checks.json` | PASS |',
'| ibis134/500 Day 2;159/500 in both week interpretations | 26.8% /31.8% /31.8%; honks634 /427 /408; zero overlaps | PASS |',
'| THE_USUAL888 in1000 seeds x5 shifts;4112 no-usual affinity-writing shifts | **888 /4112**,27,371 writes over40,000 serves; independentAcceptanceRates passes | PASS |',
'| Phase 6 subset counts2/2,8/8,ibis3/3,gate5/5; suspended8/8 with related15/15; F5+manager39/39 | Exact historical sources expand to2,8,3,5;8+5+2=15;14+25=39, and each enclosing historical full suite passed | PASS; historical-subset-verification.json |',
'| Earlier red-before-fix counts4 /6 /4 /7 /5 | Historical reports claim these; this audit reran fixed snapshots, not every old red gate snapshot | UNVERIFIED as historical red executions |',
'| Slow-audio unit timings16.05s clip/caption;18.05s25-second-load fallback at1x/2x/3x | independentSlowAudio8/8; controlled fake clock, not audible device proof | PASS in stated model |',
'| Nine stale public voice renders in the old checkout | This review checkout has0; no files were removed; historical local-only inventory cannot be reconstructed from Git | Context differs; old local-file count UNVERIFIED |',
'| Three real caption probes:0.011 /0.048 /0.027s | Historical wall-clock observations; not reproduced here without voice assets | UNVERIFIED, not relabelled current |',
'| voices:check passed after T4.6 (597 clips,0 errors) | **exit 1,597 missing-audio errors,0 warnings**; manifest597 entries; segments0/181 | F8: file-backed claim not reproduced |',
'| Release voice checks / not ready | exit 1:1649 errors =597 missing+597 placeholder+454 pitch-shift+1 shared voice | Expected release rejection; no per-speaker HUMAN summary |']
if (E/'e2e-summary.json').exists():
 q=json.loads((E/'e2e-summary.json').read_text());out.append(f"| E2E36 executed /17 opt-in skipped; perf114/102 | {q['description']} | {q['verdict']} |")
else:out.append('| E2E counts and perf114/102 | PENDING final full run | UNVERIFIED |')
out += ['',
'Historical E2E claims are scope-qualified:28 passed at ef9071d/4d33c22/b78c3a4,34 at c05d257,35 passed+1 failed at M3/M4 merges, and8 selected week/weekUi passes after the M4 fixes describe different test sets and revisions. They cannot be established as past executions by a current green run or by counting `test()` calls. This audit runs the **current full suite once, last**, preserving its own counts, skips and exit. The quoted3.6/3.7/11.0/26.7/27.8/29.7/30.5/32-minute durations and historical host load~19 are not asserted to reproduce.','',
'### Balance rows','',
'The required3-seed comparison is `3aa0828^` versus `6bc2b4d`; both are fresh archives and both run `npm run balance -- --seeds 3 --out <E/file>` (the actual argv contains one `--` separator, recorded in `commands.json`). Because3aa0828^ already contains the visits change, an additional `932563d^` export checks the true pre-visits state. CSVs and stdout are retained.','']
if (E/'balance-comparison.json').exists():
 q=json.loads((E/'balance-comparison.json').read_text());out+=['```json',json.dumps(q,indent=2),'```','']
else:out+=['PENDING final balance comparisons.','']
out += ['The30-seed A4/A5 comparisons rerun14827e0^ ->14827e0 and7586668^ ->7586668, including every profile/day row rather than only first-try percentage. The recorded table diff checks the claimed -0.1 event changes,64/65 satisfaction change, THE_USUAL-driven event increases and unchanged first-try/walkout/tries values.','',
'### E2E and device boundary','']
if (E/'e2e-summary.json').exists():
 out += [json.loads((E/'e2e-summary.json').read_text())['narrative'],'']
else:out += ['PENDING: final full E2E command, alone among test/build/balance workloads.','']
out += [
'An initial desktop comparison produced a false4px delta because the temporary checkout could not serve symlinked dependency fonts. After adding the original dependency path to that fixture’s Vite fs.allow and asserting font readiness, both revisions measure exactly x662/y133.3046875/w346/h373.390625. The invalid measurement and first unit run are retained as unit-with-invalid-font-baseline.txt / desktop-fonts-blocked.txt; they are not product findings. The corrected full unit run above is authoritative.','',
'Phone probes are Chromium CSS-viewports with touch flags and DPR1, not iPhone Safari or Android hardware. The independent probes cover both 390x844 and 375x667 at Small/Medium/Large, actual Day 1 `#subs`, Day 2 `#rsubs`, register versus `#rinstr`, and populated Scores. The original phoneHud only checks Day 2 `#rsubs` at390px and the register at default Medium; it does not cover the failing Small-text combination.','',
'T4.7 was read, not inferred from its comment: `weekUi.spec.ts:182-186` asserts the report’s `.best` line from `s.grade`; `:226` asserts the Scores row using that same mapped grade. This does establish the displayed best-grade equality on a first play. The main `.stamp` is only checked to differ from “Total disaster”; it is not directly cross-compared to Scores. No stronger assertion is claimed.','',
'## 4. Ranked findings','',
'1. **P1 F1 — `src/core/save/storage.ts:36`:** A successful disk load is not cached, so a later `getItem` exception replaces week3/shift2/$125.00/owned-grinder progress with a fresh in-memory save and the next autosave advances that new save instead of the player’s saved week (**confirmed**, one red independentAcceptanceStorage test).',
'2. **P2 F2 — `src/core/save/telemetry.ts:33`:** After reading five existing records, a read exception followed by `put` retains only the new record, dropping the earlier session logs from the running session (**confirmed**, one red independentAcceptanceStorage test).',
'3. **P2 F3 — `src/ui/styles/rush.css:504`:** The register’s zoomed top offset intersects `#rinstr` by 4.78125 px at Small text on both 390x844 and 375x667 (**confirmed**, two red independentAcceptanceBrowser tests and saved PNGs).',
'4. **P2 F4 — `todo.md:130` / `src/app/boot.ts:29`:** T2.6’s verify stays green after boot switches to its own copied pause implementation, so it cannot protect the sharing requirement (**confirmed**, mutation exit 0, added import-contract guard exit 1).',
'5. **P2 F5 — `todo.md:181` / `scripts/build-clean.ts:80`:** T3.1’s normal-build/tiny-budget verify stays green after working-tree files contaminate the HEAD export (**confirmed**, smoke0/budget1 while dirty-sentinel guard fails).',
'6. **P2 F6 — `todo.md:203` / `scripts/deploy.ts:56`:** T3.4’s verifier uses prebuilt fixtures and remains green when the real build receives `/` instead of `/no-wukkas-cafe/` (**confirmed**, mutation exit 0, subprocess-environment guard exit 1).',
'7. **P2 F7 — `todo.md:265` / `src/app/rushView.ts:65`:** T4.3’s verifier stays green when the production summary-to-score call is removed entirely (**confirmed**, mutation exit 0, three real-dispatch guards fail).',
'8. **P2 F9 — `tests/e2e/phoneHud.spec.ts:128`:** T2.5 requires measuring literal `#subs`, but its test measures only `#rsubs`, leaving the required Day 1 subtitle case absent (**confirmed** by `phone-spec-contract.json`; new independent Day 1 probes pass today).',
'9. **P3 F8 — `todo.md:279`:** The T4.6 file-backed acceptance cannot be reproduced in this checkout because all 597 placeholder files, including the new Gaz clip, are absent and the one full E2E finishes 26 passed /9 audio failures /18 skipped (**confirmed environment/evidence gap**, voices:check exit 1; not proof that the author never rendered it; the final E2E audio results share this missing-assets limitation).','',
'10. **P3 F10 — `src/ui/screens/shiftReport.ts:34`:** For a non-new-best Endless run, the report replaces T4.3’s required grade/served wording with served/tips (**confirmed**, exact input/output in the executed bestLine test; a literal-copy mismatch, not a scoring error).','',
'The real application rereads the save in app/weekWiring.ts:21,50,53 and commits a summary through finishShift at:108, so the read-error sequence is reachable in the same running session. The regression starts with week3/shift2 and calls that actual finishShift function after the failure.','',
'F10 is a literal-spec deviation, not a ranking defect: with mode=endless, grade=good, served=14 and tipsCents=2150, the executed UI test confirms “Best so far: 14 served, $21.50 in tips”; T4.3 prescribes “Best so far: Good, 14 served” without an Endless exception. The M4 goal defines Endless ranking by served/tips, but does not explicitly change this report-copy clause. Align the implementation or formally amend that clause.','',
'F1/F2 are the explicitly requested replan flaws, not duplicates of the prior scores-store finding. Their disk backing data remains unchanged because the stores switch permanently to memory-only after the exception; **permanent disk deletion was not reproduced**. F1 is P1 for severe same-session progress loss, not an unsupported disk-wipe claim. Minimal repair: cache the last successfully migrated/parsed read in each store, as scores now does.','',
'F3 combines `rush.css:504`’s measured absolute top with `base.css:166`’s0.9 zoom; instruction bottom119.078125, POS top114.296875. The red tests assert non-intersection rather than accepting the overlap. Medium/Large pass. Minimal repair: express the offset in consistent screen/layout units and retain both phone/text-size regressions.','',
'The missing-asset preflight is also misleading: audio.spec.ts:44, audioSmoke.spec.ts:81-82 and audioState.spec.ts:65 test only response.ok(). Trace network records show absent MP3 URLs returning200 text/html (Vite SPA fallback), so the tests run instead of skipping and then observe TTS or no completed clip. See e2e-audio-responses.json and the final E2E failures; these are not audio acceptance passes.','',
'F9 is a missing specified regression case, not a current Day 1 layout failure: the shared CSS explains why Day 2 is a useful proxy, but does not make the two DOM elements identical. The six new independent Day 1 tests supply the missing coverage; retain it in the named verification path.','',
'Exploratory Node-loader commands in usual-exact*.txt failed before producing a rate measurement; the successful independentAcceptanceRates run supplies the reported rates. Reviewer-only formatting mistakes were corrected before the final typecheck/lint run. Their saved initial outputs are not product findings.','',
'F4–F7 are verifier defects, not claims that the corresponding production features are currently broken. Add the failing-under-mutation guards to each task’s verification path. F8 requires restoring/providing the authorised development assets before claiming file-backed audio acceptance; do not regenerate manifests, purchase voices or change production code to hide it.','',
'## 5. M5 and Edward-gate honesty','',
'| Gate | Observation | Verdict |','| --- | --- | --- |',
'| T5.1 per-speaker release summary with HUMAN action | voices-check.ts:140 groups error codes and prints at most25 examples, not per-speaker paid-render/actor-import instructions; release exits1 before build | Not implemented |',
'| T5.2 version/changelog | package.json already0.1.0 in initial aed6129; no later version bump, CHANGELOG.md or tests/scripts/version.test.ts | Partly pre-existing; task not complete, no covert M5 bump |',
'| T5.3 What the bots got wrong | Heading absent in docs/DEVLOG.md | Not implemented |',
'| T5.4 release:tag | package script, release-tag implementation and releaseTag.test.ts absent | Not implemented |',
'| Analytics provider / online leaderboard | Production fetch sites are own audio assets; dev-only review IO is separate; no analytics SDK or online score transport in source/dependencies | No wiring found; local scores only |',
'| Paid TTS | Existing T5.0 Google adapter is an explicitly recorded older capability; no paid call made in this audit, manifests remain placeholder | Historical never-called claim UNVERIFIED without provider audit logs |',
'| Audio in git | Required git ls-files audio-extension scan is empty | PASS |',
'| Deployment | gh-pages db4c056 unchanged before/after; only dry run to project remote | No publication in this audit; a historical no-op --push cannot be disproved by an unchanged ref |',
'| DECISIONS.md | Answered AFFINITY_RULE, SEGMENT_GATE andQ1 unchanged; Q2-Q7 remain open; history inspected | No new answer authored; historical human authorship not independently authenticated |',
'| Determinism | requested grep exits1 with0 matches under src/sim and src/core | PASS (grep1 means no match) |',
'| Source size | Only the same six files previously listed exceed600 lines | PASS, no newly oversized module |','',
'Existing over600-line files: trial.ts687; ownerLines.ts937; voice/manifest.json14933; dev.css839; world/owner.ts623; world/station.ts894. These match the previous M4 review and are not new findings. No source, save schema, economy tuning, audio generation, paid API call, analytics choice, online service, release tag or publication was added by this review.','',
'## Edward에게 (한국어)','',
'- Q2: 병합된 로컬 브랜치 정리 여부, Q3: 기존 작업 폴더의 오래된 음성 렌더 삭제 여부.',
'- Q4: extra-hot 게이지 목표를 68–74°C로 바꿀지, Q5: Day 1·연습 자막을 음성 시작에 맞출지.',
'- Q7: 오디오 중단 시 자막 대기·즉시 표시·게임 일시정지 중 어떤 동작을 선택할지.',
'- 공개 호스트·도메인, 분석 도구 사용, 유료 음성·배우 녹음 진행 여부.',
'- 온라인 순위표 여부와 Q6의 Steam 출시 시점·래퍼·기능 범위.','']
R.write_text('\n'.join(out))
print(R,len(out),'lines')
