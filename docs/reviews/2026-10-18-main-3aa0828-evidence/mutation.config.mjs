// Negative controls only: substitute old code in memory, never write src/ or the shared harness.
import { defineConfig } from 'vitest/config';
import { execFileSync } from 'node:child_process';
export default defineConfig({
 plugins:[{name:'independent-negative-control',enforce:'pre',transform(code,id){
  const target=process.env.REVIEW_M2_MUTATION==='f5'?'src/audio/voiceLines.ts':'tests/review/harness.ts';
  if(!id.endsWith('/'+target))return;
  return execFileSync('git',['show',`157329e:${target}`],{encoding:'utf8'});
 }}],
 test:{environment:'node',include:['tests/review/independent*.test.ts'],testTimeout:20000}
});
