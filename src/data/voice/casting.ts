// Audition candidates per character, for `npm run voices:audition`. DATA ONLY: listing a
// candidate here doesn't approve, buy or render anything (docs/VOICE_CASTING.md).
//
// provider 'macos'  local `say`: pipeline test only, never a casting candidate (placeholder licence)
// provider 'files'  recordings delivered by an actor or provider, imported from a folder
// provider 'azure'  Azure Neural TTS: needs --allow-paid and credentials; untested (no account)
//
// Azure voice names are from Microsoft's published catalogue as known in 2026-10; check them
// against the current list before an audition.

export type Provider = 'macos' | 'files' | 'azure';

export interface Candidate {
  provider: Provider;
  /** Provider voice name (macOS voice, Azure short name) or, for 'files', a folder name. */
  voice: string;
  /** Speaking-rate multiplier and SSML style, where the provider supports them. */
  rate?: number;
  style?: string;
  /** Why this one is worth hearing. */
  note: string;
}

export const CASTING: Record<string, readonly Candidate[]> = {
  gaz: [
    {
      provider: 'azure',
      voice: 'en-AU-DuncanNeural',
      note: 'older Australian male; check dryness',
    },
    { provider: 'azure', voice: 'en-AU-WilliamNeural', note: 'Australian male, warmer' },
    { provider: 'files', voice: 'gaz-actor-a', note: 'preferred: a human actor for comic timing' },
  ],
  dazza: [
    {
      provider: 'azure',
      voice: 'en-AU-NeilNeural',
      rate: 1.1,
      note: 'younger Australian male, fast',
    },
    { provider: 'azure', voice: 'en-AU-KenNeural', rate: 1.1, note: 'alternative' },
  ],
  beryl: [
    { provider: 'azure', voice: 'en-AU-ElsieNeural', rate: 0.9, note: 'mature Australian female' },
    { provider: 'files', voice: 'beryl-actor-a', note: 'older actor if TTS sounds too young' },
  ],
  karen: [
    { provider: 'azure', voice: 'en-AU-NatashaNeural', note: 'crisp Australian female' },
    { provider: 'azure', voice: 'en-AU-JoanneNeural', note: 'alternative' },
  ],
  priya: [
    { provider: 'azure', voice: 'en-IN-NeerjaNeural', rate: 0.95, note: 'Indian English female' },
    { provider: 'azure', voice: 'en-IN-AnanyaNeural', rate: 0.95, note: 'alternative' },
  ],
  jiwoo: [
    { provider: 'files', voice: 'jiwoo-actor-a', note: 'Korean L2 English speaker (recommended)' },
  ],
  mei: [
    { provider: 'files', voice: 'mei-actor-a', note: 'Mandarin L2 English speaker (recommended)' },
  ],
};

/** The placeholder voices, auditionable only to test the pipeline end to end. */
export const PIPELINE_TEST: Record<string, Candidate> = {
  gaz: { provider: 'macos', voice: 'Karen', note: 'pipeline test only' },
  priya: { provider: 'macos', voice: 'Tara', note: 'pipeline test only' },
  jiwoo: { provider: 'macos', voice: 'Yuna', note: 'pipeline test only' },
  mei: { provider: 'macos', voice: 'Tingting', note: 'pipeline test only' },
};
