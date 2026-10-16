// What the licensed voice pass costs before anything is called (docs/TODO.md Phase 3): characters
// and AUD per TTS speaker of the release cast (src/data/voice/casting.ts CAST), and what the
// actors record. Refuses (exit 1) when the pass would cost more than the cap.
//
//   npm run voices:estimate                    every script line (normal and slow takes)
//   npm run voices:estimate -- --segments      plus every generated-order segment
//   npm run voices:estimate -- --cap 5         a lower cap for this run (never above the data's)
//
// Prices: TTS_BUDGET (Chirp 3 HD US$30 per 1M characters, spaces count, free tier ignored).

import { argValue } from './voice-node.ts';

const { voiceScript } = await import('../src/data/voice/script.ts');
const { CAST, TTS_BUDGET } = await import('../src/data/voice/casting.ts');
const { SEGMENT_INVENTORY } = await import('../src/data/voice/segments.ts');
const { voicePlan, totalsBySpeaker } = await import('./voices-plan.ts');
const { estimateCost } = await import('./tts-provider.ts');

const args = process.argv.slice(2);
const withSegments = args.includes('--segments');
const capArg = Number(argValue(args, '--cap') ?? TTS_BUDGET.capAud);
const cap = Math.min(TTS_BUDGET.capAud, Number.isFinite(capArg) ? capArg : TTS_BUDGET.capAud);

const plan = voicePlan(voiceScript(), CAST, withSegments ? SEGMENT_INVENTORY : null);
const money = (x: number): string => x.toFixed(2);
const n = (x: number): string => x.toLocaleString('en-AU');

console.log(
  `voices:estimate: Google Chirp 3 HD at US$${TTS_BUDGET.usdPerMillionChars} per 1M characters, ` +
    `AUD/USD ${TTS_BUDGET.audPerUsd} (checked ${TTS_BUDGET.checkedOn}; free tier ignored)` +
    `${withSegments ? ', segments included' : ''}`,
);
console.log('Licensed TTS:');
let chars = 0;
for (const t of totalsBySpeaker(plan.tts)) {
  const c = estimateCost(t.chars, TTS_BUDGET);
  chars += t.chars;
  console.log(
    `  ${t.speaker.padEnd(6)} ${String(t.lines).padStart(4)} lines ${String(t.segments).padStart(4)} segments ` +
      `${n(t.chars).padStart(7)} chars  US$${money(c.usd)}  AU$${money(c.aud)}  ${CAST[t.speaker]?.voice ?? ''}`,
  );
}
const total = estimateCost(chars, TTS_BUDGET);
console.log(
  `  total  ${n(chars)} chars  US$${money(total.usd)}  AU$${money(total.aud)} (cap AU$${money(cap)})`,
);
console.log('Recorded by actors (no TTS cost; the script they read is the review sheet):');
for (const t of totalsBySpeaker(plan.recorded))
  console.log(
    `  ${t.speaker.padEnd(6)} ${String(t.lines).padStart(4)} lines ${String(t.segments).padStart(4)} segments ` +
      `${n(t.words).padStart(6)} words  ${CAST[t.speaker]?.pending ? 'licence pending' : ''}`,
  );
if (total.aud > cap) {
  console.error(
    `refused: AU$${money(total.aud)} is over the AU$${money(cap)} cap. Nothing may be rendered.`,
  );
  process.exitCode = 1;
}
