import json,pathlib
rows=[]
def add(task, clauses):
 for i,(text,status,proof) in enumerate(clauses,1):rows.append({'task':task,'id':f'{task}.{i:02}','clause':text,'status':status,'evidence':proof})
P='PASS';F='FAIL';U='UNVERIFIED'
add('T2.1',[
('Land d8be91a / fix/review-0cae2cf in main',P,'source-checks.json ancestry d8be91a=0; git show 157329e (merge parents)'),
('A cancelled suspended-context line is cut rather than faded on resume',P,'src/audio/voiceLines.ts:88; task-verifiers.txt: independentSuspendedCancellation and manager tests'),
('Typecheck, lint and units exit 0 on the implementation branch before merge',U,'Historical unit snapshot b78c3a4 is rerun; old branch timing and historical lint/typecheck execution cannot be recovered from source'),
('Run the full E2E on that branch, before tick/merge',U,'Historical outcome/timing not independently rerun; only current full E2E is authorised once'),
('Append Phase 6 6.12 with d8be91a, P2 F4 and unit/E2E/reviewer evidence',P,'docs/TODO.md: Phase 6 6.12 and Evidence; git show 8fe52d1'),
('Merge with --no-ff, then fast-forward push main',P,'157329e has two parents; d8be91a ancestor of freshly fetched origin/main (historical push command itself is not inferable)'),
('Send review the main SHA, unit/E2E counts and ready-for-review message',U,'No independently accessible message receipt; a planning note is not a receipt'),
('Cut feat/m2-leftovers from main for the remaining tasks',P,'git merge-base 932563d 157329e = 157329e; c05d257 merge topology'),
('The exact verify ancestry and three reviewer files succeed now',P,'source-checks.json ancestry; task-verifiers.txt, 154/154 selected tests')])
add('T2.2',[
('RegularMemory.visits increases on every accepted regular serve in a week shift, correct or not',P,'src/core/rush/serve.ts:93; src/core/rush/events.ts:184; tests/core/regularAffinity.test.ts'),
('A hand-back, Day 2, and non-regular customer do not gain regular visits',P,'src/core/rush/events.ts:185; regularAffinity author controls plus independentM2 controls in baseline'),
('finishShift carries visits into the save',P,'src/core/week/session.ts:65; src/app/weekWiring.ts:108; regularAffinity two-shift test'),
('Two visits, one wrong yields visits 2 and affinity 1',P,'task-verifiers.txt: regularAffinity two-shift assertion'),
('Affinity rules are unchanged',P,'events.ts:188; event-rates.txt: 35,113 correct serves + 888 usual points = 36,001, zero mismatches'),
('Nothing reads visits to choose events; event mix / first-try table unchanged',P,'balance3 comparison: requested 3aa0828^ versus 6bc2b4d, plus actual pre-change 932563d^; visits use search'),
('Commit body records identical before/after first-try table',P,'git show 932563d: novice 90/63/37/0/0, average 100/100/100/80/60, expert 100 each'),
('Verify goes red without the feature',P,'mutation-T2.2.txt exit 1, wrong-serve visits and saved total fail')])
add('T2.3',[
('Current index equals save.shift: open in week 1 and week 2+',P,'src/core/week/progress.ts:86; independentAcceptanceContracts all 5 indices in weeks 1,2,9'),
('Earlier index: done, irrespective of old best',P,'same exhaustive row test; progress.ts:86'),
('Later index: locked, including rows with week-1 bests',P,'same exhaustive row test and author week-2 case'),
('best grade is retained even on locked rows',P,'progress.ts:87; all 15 row arrays checked'),
('shiftRows agrees with canPlay / shiftCells',P,'src/core/week/session.ts:19; src/ui/screens/labels.ts:51; baseline UI screen tests'),
('Verify goes red under old-best-based status',P,'mutation-T2.3.txt exit 1')])
add('T2.4',[
('Register implementation and styles live in src/ui/pos.ts and src/ui/styles/rush.css',P,'files inspected; rush.css:503 positions the register below measured rail'),
('At seed 7 Day 2, register does not cover #rinstr at 390x844 while ordering',F,'F3: independentAcceptanceBrowser Small case: POS top 114.296875 < instruction bottom 119.078125'),
('The same non-intersection holds at 375x667',F,'F3: same 4.78125px overlap; phone-small-reproduction.txt'),
('Retain a real Playwright phoneHud spec driven by __trial, rather than jsdom',P,'tests/e2e/phoneHud.spec.ts:1-180; actual expanded Chromium probes'),
('1024x640 register box unchanged within 2px from its earlier box',U,'Pending full E2E desktop register check; authored baseline x662/y133.3/w346/h373.4 must also match earlier source'),
('Named verify passes for its covered cases',U,'Pending final E2E phoneHud; author verifies default Medium only, not Small register')])
add('T2.5',[
('Subtitle rules live in base.css / hud.css and #subs stays inside 390px at Medium',P,'independentAcceptanceBrowser actual Day 1 #subs x16 width358'),
('Large #subs stays inside 390px',P,'independentAcceptanceBrowser actual Day 1 #subs x16.21875 width357.5625'),
('Small/Medium/Large at both 390x844 and 375x667 stay in viewport',P,'browser-expanded.txt: six actual #subs boxes; six #rsubs boxes'),
('phoneHud.spec.ts adds every text size while a subtitle shows',P,'phoneHud.spec.ts:136 tests s,m,l; explicitly measures #rsubs, not #subs; independent tests cover literal #subs'),
('Named subtitle verify runs and passes',U,'Pending full E2E subtitle cases')])
add('T2.6',[
('setPaused, resumeAll and replay implementation exist once in a small exported src/app module',P,'src/app/pause.ts:10,27,36 (replayLast); 55 lines; source-checks.json'),
('boot imports all three shared functions',P,'src/app/boot.ts:29,101,175; independentAcceptanceContracts import test'),
('review harness imports the same functions, copy/comment removed',P,'tests/review/harness.ts:16,475; no copied, not shared match'),
('All seven rushTrace hashes remain identical to 2026-10-17-main-1a54a00',P,'rush-trace.txt and artifact-checks.json: seven true equalities'),
('The named verify detects drift back to a separate boot copy',F,'F4: mutation-T2.6.txt exits 0 after boot imports pauseDuplicate; new contract test exits 1')])
add('T2.7',[
('Two-line top banner moves planning to todo.md on 2026-10-18 and preserves Evidence archive',P,'docs/TODO.md:3-4; git show 0f30d16'),
('MILESTONES Notes maps its M1-M7 to the new M2-M5 including human gates',P,'docs/MILESTONES.md:21; git show 0f30d16'),
('No other existing document text changed',P,'0f30d16 diff adds banner and Notes only; root todo tick is bookkeeping'),
('Both grep predicates succeed',P,'docs/TODO.md contains Planning moved to; docs/MILESTONES.md contains todo.md')])
add('T2.8',[
('Merge local review branch 5b675ce with --no-ff',P,'1f0bfa8 merges descendant 0b72172; source-checks.json ancestry'),
('Suspended cancellation also cuts every source in fading, not only current source',P,'src/audio/voiceLines.ts:88; independentSuspendedCancellation F5 cases all green'),
('Uncancelled resume and exactly-once onStart preserved',P,'task-verifiers.txt suspendedCancellation/manager controls'),
('No later segment starts after cancellation',P,'task-verifiers.txt segment cancellation controls'),
('Phase 6 contains 6.13 and Evidence',P,'docs/TODO.md Phase 6 6.13; historical-unit-4c4d72d.txt'),
('Exact two-file verify succeeds',P,'same two files included in task-verifiers.txt (39 tests combined)')])
add('T3.1',[
('scripts/build-clean.ts is exposed as npm run build:clean',P,'package.json:13; scripts/build-clean.ts:1'),
('Export HEAD via git archive into scratch, never uncommitted source',P,'build-clean.ts:79; independentAcceptanceBuild dirty source/HTML sentinel test passes'),
('Symlink node_modules and run the production build in scratch',P,'build-clean.ts:84-90; clean-build.txt'),
('Copy built dist back',P,'build-clean.ts:100-102; actual output HTML inspected'),
('Print the audio-gate line',P,'clean-build.txt: [audio-gate] ok: 0 licensed audio file(s) in the build'),
('Print non-audio bytes and default 3,000,000-byte budget',P,'clean-build.txt: 1,562,576 bytes, budget 3,000,000'),
('Preserve build failure exit code',U,'build-clean.ts:93,130 implements propagation; no injected failing child-build exit was executed'),
('--budget 1 exits 1 on excess',P,'budget-one.txt exit 1; over by 1,562,575'),
('AGENTS section 3 documents the command',P,'AGENTS.md:47'),
('Named two-command verify detects losing HEAD isolation',F,'F5: mutation-T3.1 smoke=0 / budget=1 despite dirty-tree overlay; independent build sentinel red')])
add('T3.2',[
('Title is No Wukkas Café and description names the week',P,'index.html:11-14; indexMeta.test.ts, 4 passed'),
('og:title, og:description, og:image, og:type and twitter:card exist',P,'index.html:18-31; indexMeta.test.ts'),
('public/og.png exists, is 1200x630, at most 300kB',P,'source-checks.json: 235,963 bytes and PNG dimensions'),
('scripts/og-image.ts uses Playwright, title screen, 1200x630, free dev port, voice=0',P,'scripts/og-image.ts:24-52 source; committed image visually inspected'),
('A fresh run of the screenshot generator produces the claimed image',U,'Generator not executed: would overwrite public/og.png outside allowed review edits; committed pixels inspected only'),
('PNG is committed and metadata test parses tags / checks file',P,'git ls-files public/og.png; task-verifiers.txt'),
('og:image resolves correctly under repository base and domain base',P,'artifact-checks.json actual deployed HTML: absolute github.io/no-wukkas-cafe/og.png and cafe.example.com/og.png')])
add('T3.3',[
('tests/e2e/perf.spec.ts runs in normal suite, no opt-in',P,'perf.spec.ts has unconditional tests; final E2E discovery'),
('Uses 1024x640 and 390x844',P,'perf.spec.ts:13-21'),
('Day 2 seed7 with at least three customers in cafe',P,'perf.spec.ts:55,67; real run measurement pending'),
('Reads real drawCalls from renderer.info.render.calls',P,'src/app/debug.ts drawCalls getter; perf.spec.ts:34,74'),
('Asserts strictly fewer than 150 calls, logs median frame time without asserting it',P,'perf.spec.ts:104-118'),
('Writes JSON sidecars per viewport',U,'Pending final E2E reports/perf/*.json'),
('Both runtime measurements meet budget (or fixme with recorded over-budget result)',U,'Pending final E2E; no fixme in current spec')])
add('T3.4',[
('scripts/deploy.ts is npm run deploy, calls build:clean',P,'package.json:14; deploy.ts:60-65; deploy-dry.txt'),
('Temporary worktree of origin/gh-pages replaces its content with dist',P,'deploy.ts:84-88; artifact-checks.json and local bare-repo tests'),
('Adds .nojekyll',P,'actual dry-run commit trees and bare-repo --push test'),
('--domain adds CNAME with host',P,'artifact-checks.json domain commit: cafe.example.com newline'),
('Commits deploy <sha> and prints would-push destination',P,'deploy-dry.txt: deploy 6bc2b4d, origin/gh-pages and URL'),
('Dry run default pushes nothing; remote remains db4c056',P,'pages-before/after/after-domain.txt same db4c0567f5ba00ec9bf6078da44a8c78b5a17ef0'),
('--push updates branch, exercised only against temporary bare repos in this audit',P,'tests/scripts/deploy.test.ts:37-81 fixture and explicit --push tests; no project push invoked'),
('Repository base /no-wukkas-cafe/ and domain base / are passed via environment',P,'artifact-checks.json actual built script URLs; independentAcceptanceBuild environment controls'),
('No dependency added',P,'git show 83eadff -- package.json: script only'),
('Temporary repo test covers unchanged dry-run remote / updated pushed branch',P,'task-verifiers.txt: deploy 7/7'),
('Named verify detects a broken production build base',F,'F6: mutation-T3.4.txt exit0 with NWC_BASE="/"; independent child-environment test exit1')])
add('T3.5',[
('README describes 30-minute session, dev --host or deployed URL',P,'docs/playtests/README.md:3-27 read'),
('Clear between testers and Export at end; where files go',P,'README Before/After session: docs/playtests/logs and dated notes'),
('Template captures device/browser, Trial result, shifts played and stuck points',P,'docs/playtests/TEMPLATE.md Setup, Results and Where they got stuck'),
('Template captures pardons/order, walk-outs, one more shift yes/no and quotes',P,'TEMPLATE.md Numbers, One more shift, Quotes'),
('Metrics derive from ROADMAP Success metrics and TODO Phase5; copy instructions only',P,'README What we want to learn and TEMPLATE Copy instruction; no fabricated tester data'),
('Both required files exist',P,'read and inspected both files')])
add('T3.6',[
('npm playtest:summary accepts multiple log.json arguments',P,'scripts/playtest-summary.ts:38; summary-duplicate.txt'),
('Pure src/sim/telemetrySummary.ts accepts version1 exported records',P,'telemetrySummary.ts:100-120; purity baseline and task units'),
('Aggregates sessions and shifts without double-counting repeated same-session records',P,'summary-sample/duplicate.txt; independentM3 duplicate checkpoint cases pass'),
('Aggregates served and walk-outs by stage',P,'summary-sample.txt: 8 served, 6 register walk-outs; telemetrySummary tests'),
('Aggregates accuracy per field and pardons/order',P,'summary-sample.txt and telemetrySummary tests'),
('Aggregates register wait median/max',P,'independentM3 pooled-median case and telemetrySummary tests'),
('Aggregates quit points and trial verdicts',P,'summary-sample.txt; telemetrySummary tests'),
('CLI emits Markdown tables',P,'summary-sample.txt actual output'),
('Fixture tests/fixtures/telemetry/sample.json was generated by headless playRush',U,'Fixture values match schema; generation provenance is not retained as an executable generator; do not infer its authoring process'),
('Other versions rejected with diagnostic and exit1',P,'summary-version.txt exit1: log version2, reads version1'),
('Empty log yields zero/dashes, corrupt record rejected, two same-session logs deduplicated',P,'summary-empty exit0; summary-corrupt exit1; summary-duplicate and independentM3 tests'),
('Named verifier succeeds',P,'task-verifiers.txt + summary-sample.txt')])
add('T3.7',[
('README adds how to play including URL pending publication and phone use',P,'README.md:25-56; b62c41f diff additive'),
('Controls include Space and 1-3',P,'README.md:42-43'),
('Links playtest kit',P,'README.md Playtesting'),
('Points command table to AGENTS section3 and architecture to docs/DEVLOG.md',P,'README.md For developers'),
('Existing sections retained, not rewritten',P,'git show b62c41f -- README.md (additions only)'),
('Both grep predicates succeed',P,'README text contains docs/playtests and DEVLOG')])
add('T3.8',[
('Duplicate record keeps copy that closed last, independent of file order',P,'src/sim/telemetrySummary.ts:164-170; independentM3 checkpoint reversal cases green'),
('readExport validates every record before aggregation',P,'telemetrySummary.ts:116-119; independentM3 five invalid-record controls green'),
('All seven previous red tests now green',P,'task-verifiers.txt independentM3 9/9, including seven previous reds'),
('Phase6 has 6.14 and 6.15',P,'docs/TODO.md Phase6 source'),
('Exact gate verifier succeeds',P,'task-verifiers.txt includes independentM3 + telemetrySummary: 17/17')])
add('T4.1',[
('src/sim/scores.ts defines ScoreEntry with mode day2/week/endless, week, shiftIndex, seed, difficulty',P,'scores.ts:13-23; score tests and independent dispatch three modes'),
('Entry grade, served, walkouts, integer tipsCents and passed-in ISO at',P,'scores.ts:24-30,145-157; fromSummary test'),
('Board keys separate every shift/difficulty and Endless/difficulty',P,'scores.ts:51-55; score key tests'),
('emptyScores and parseScores recover corrupt/other-version data',P,'scores.ts:47,185; author parser and independentM4 malformed-grade/cross-board controls green'),
('Week ranking: grade, then served, then tips, then fewer walkouts',P,'scores.ts:58-67; scores.test.ts ordering cases; mutation T4.1 red'),
('Endless ranks served then tips, not grade or walkouts',P,'scores.ts:59,67; score Endless test'),
('Ties keep earlier entry',P,'scores.ts:81; author tie case + independentM4 reload control'),
('Top ten cap per board',P,'scores.ts:11,83; score cap test'),
('insert and isNewBest do not change their input',P,'scores.ts:72-89,118; score tests / independentM4 original equality'),
('fromSummary maps summary and context fields',P,'scores.ts:140-157; author fromSummary test'),
('Named verifier detects a ranking regression',P,'mutation-T4.1.txt exit1 when fewer-walkouts tie-break removed')])
add('T4.2',[
('src/core/save/scores.ts offers read/put/clear and memoryOnly',P,'scores store:11-20,51-62; scores store tests'),
('Own versioned key nwc.scores.v1; outside save, no save migration',P,'scores store:9; newSave contract has no scores; key isolation store test'),
('Persistence, clearing and failed storage use telemetry-store pattern',P,'score store tests5/5; copy intentionally differs after T4.8 caches last read'),
('Tests at tests/core/save/scores.test.ts cover corresponding store operations',P,'task-verifiers.txt'),
('Named verifier succeeds',P,'task-verifiers.txt score store5/5')])
add('T4.3',[
('App has scores; harness supplies memory store',P,'src/app/context.ts scores; tests/review/harness.ts createScoresStore(null); independent dispatch controls'),
('Every week summary is recorded',P,'src/app/rushView.ts:64-65; independentAcceptanceContracts week'),
('Day2 and Endless summary paths are recorded',P,'same event boundary; independentAcceptanceContracts day2/endless'),
('Write happens before report renders and exactly once',P,'rushView.ts:64-67; independentM4 three frame dispatch controls'),
('Report in src/ui/screens/shiftReport.ts shows New best! or Best so far grade,N served',P,'shiftReport.ts:30-38; UI bestLine tests; Endless deliberately uses served/tips per M4 goal'),
('Summary tests cover one entry / worse second run keeps best; UI tests cover both lines',P,'tests/app/scores.test.ts; tests/ui/shiftReport.test.ts; 6 tests pass'),
('The named verify detects removing actual report-path score recording',F,'F7: mutation-T4.3 exit0; independent dispatch tests3 red')])
add('T4.4',[
('src/ui/screens/scores.ts displays Mon-Fri best per played difficulty',P,'scores.ts:24-39; UI fixture tests + populated browser boards'),
('Endless top10 includes served and AUD tips',P,'scores.ts:48-59; browser has30 rows across3 difficulties'),
('Clear scores asks twice and first click preserves stored scores',P,'scores.ts:99-113; actual browser clicks and localStorage comparison'),
('Scores title entry wired in title screen and app/title.ts',P,'src/ui/screens/title.ts:61; actual browser title-to-Scores activation'),
('Esc closes, Tab loops, focus returns',P,'scores.ts:119; browser Tab/ShiftTab/Escape/focus assertions'),
('No horizontal scroll at390px',P,'browser actual full boards at Large: clientWidth=scrollWidth390, no child overflow'),
('Fixture row/cents tests and title-button test exist and pass',P,'task-verifiers.txt tests/ui/scores.test.ts + screens.test.ts7/7')])
add('T4.5',[
('One rush.end.newBest key in src/data/ownerLines.ts',P,'ownerLines.ts:888; voice script coverage'),
('src/sim/owner.ts places it after the grade line',P,'owner.ts:138-139; endLines test'),
('Copy is count-agnostic Australian English',P,'ownerLines.ts:888; author content test'),
('Never said in Endless',P,'machine.ts:311; author + independentAcceptanceContracts real machine controls'),
('Never said in Day2',P,'same controls'),
('Never on first play, only beats an existing week best',P,'machine.ts:311-313; author + independent controls'),
('New key queued in AWAITING_RENDER before rendering',P,'git show 09c6d64 -- src/data/voice/script.ts'),
('Owner/voice tests detect violating mode/first-play restrictions',P,'mutation-T4.5.txt exit1; actual machine test catches always-true newBest')])
add('T4.6',[
('Gaz placeholder new-best clip rendered with voices --only gaz',U,'No local voice-cache; voices:check exits1 with597 missing files; renderer invocation cannot be proved from manifest alone'),
('Manifest committed, no audio committed',P,'f3d85b3 diff adds one gaz manifest clip; git ls-files audio empty'),
('AWAITING_RENDER empty again',P,'src/data/voice/script.ts:37 new Set([]); data voice tests'),
('voices:check succeeds with actual file duration',U,'voice-files.txt: new gaz clip unavailable along with596 other placeholders; do not confuse manifest pass with audio pass')])
add('T4.7',[
('Monday pass in tests/e2e/weekUi.spec.ts followed by title -> Scores',P,'weekUi.spec.ts:235-243'),
('Scores Monday grade equals grade displayed by report',P,'weekUi.spec.ts:196-202 asserts report .best using s.grade; :249-250 asserts Scores uses same grade; neither assertion compares report .stamp wording directly'),
('Screenshot10-scores.png into week-UI evidence dir',U,'weekUi.spec.ts:254 snap exists; pending final E2E actual image'),
('Named weekUi verifier completes successfully',U,'Pending final full E2E')])
add('T4.8',[
('Restart after difficulty change refreshes weekBest for Gaz',P,'src/app/rushWiring.ts:64-67; independentM4 two restart scenarios green'),
('parseScores accepts own-key grades and only entries on their own board',P,'scores.ts:175,199; independentM4 parser scenarios green'),
('Scores store caches last good read',P,'src/core/save/scores.ts:30-31; independentM4 late failure case green'),
('All5 former red reviewer tests green',P,'task-verifiers.txt independentM4 9/9'),
('docs/TODO.md has6.16-6.18; gate verify succeeds',P,'Phase6 inspected; task-verifiers.txt')])
pathlib.Path(__file__).with_name('clauses.json').write_text(json.dumps(rows,indent=2)+'\n')
print(len(rows),'clauses')
