# Decisions queue

Agents append questions here; Edward answers in place with one line. Agents read this file before asking anything.
An unanswered question is not a blocker: mark the item `[!]` and move on. Format: `- [ ] Qn (date, who asks): question` → Edward replaces `[ ]` with `[x]` and adds `→ answer`.

## Answered
- [x] AFFINITY_RULE (2026-10-17): correct serve to a regular adds +1 affinity → yes
- [x] SEGMENT_GATE (2026-10-17): placeholder segment fails the build → yes
- [x] Q1 (2026-10-18, impl): the inverted reviewer test in 7586668 — keep, or have review re-issue it? → review re-issues it, asserting AFFINITY_RULE

## Open (from RUN3_REPORT, 2026-10-18)
- [ ] Q2 (impl): delete the 21 merged local branches listed in RUN3_REPORT? (TODO rule says never delete branches)
- [ ] Q3 (impl): the nine stale untracked renders in public/assets/voice/ break the in-checkout build — delete them?
- [ ] Q4 (impl): milk gauge target zone follows the ticket on extra-hot orders (68–74 °C)?
- [ ] Q5 (impl): Day 1 trial and practice captions get the rush's "start with the voice" rule?
- [ ] Q6 (docs/STEAM.md): first release or later port; Tauri or Electron; Steam features (none / achievements / Cloud)?

## Open (independent review of 0cae2cf, 2026-10-18)
- [ ] Q7 (review): when the browser suspends audio while the game keeps running, should captions keep waiting for audio while patience drains (current behaviour), show immediately as a fallback, or should the game pause until sound resumes?
