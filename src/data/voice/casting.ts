// Audition candidates per character, for `npm run voices:audition`. DATA ONLY: listing a
// candidate here doesn't approve, buy or render anything (docs/VOICE_CASTING.md).
//
// provider 'macos'  local `say`: pipeline test only, never a casting candidate (placeholder licence)
// provider 'files'  recordings delivered by an actor or provider, imported from a folder
// provider 'azure'  Azure Neural TTS: needs --allow-paid and credentials; untested (no account)
// provider 'google' Google Cloud TTS (Chirp 3 HD): needs --allow-paid and credentials
//                   (scripts/tts-google.ts); untested against the live service (no account)
//
// Voice names were checked against Microsoft's and Google's published voice lists on 2026-10-14
// (docs/VOICE_PROVIDERS.md). Google's one-word persona descriptions ("Gravelly") come from its
// Gemini voice list: that they fit the en-AU variants is unverified. Listen before trusting them.

export type Provider = 'macos' | 'files' | 'azure' | 'google';

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
    {
      provider: 'google',
      voice: 'en-AU-Chirp3-HD-Algenib',
      note: 'HD; persona described as "Gravelly" (unverified for en-AU)',
    },
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
    {
      provider: 'google',
      voice: 'en-AU-Chirp3-HD-Fenrir',
      note: 'HD; persona described as "Excitable" (unverified for en-AU)',
    },
  ],
  beryl: [
    { provider: 'azure', voice: 'en-AU-ElsieNeural', rate: 0.9, note: 'mature Australian female' },
    {
      provider: 'google',
      voice: 'en-AU-Chirp3-HD-Gacrux',
      note: 'HD; persona described as "Mature" (unverified for en-AU); no provider has an elderly voice',
    },
    { provider: 'files', voice: 'beryl-actor-a', note: 'older actor if TTS sounds too young' },
  ],
  karen: [
    { provider: 'azure', voice: 'en-AU-NatashaNeural', note: 'crisp Australian female' },
    { provider: 'azure', voice: 'en-AU-JoanneNeural', note: 'alternative' },
    {
      provider: 'google',
      voice: 'en-AU-Chirp3-HD-Kore',
      note: 'HD; persona described as "Firm" (unverified for en-AU)',
    },
  ],
  priya: [
    { provider: 'azure', voice: 'en-IN-NeerjaNeural', rate: 0.95, note: 'Indian English female' },
    { provider: 'azure', voice: 'en-IN-AnanyaNeural', rate: 0.95, note: 'alternative' },
    {
      provider: 'google',
      voice: 'en-IN-Chirp3-HD-Leda',
      note: 'HD; persona described as "Youthful" (unverified for en-IN)',
    },
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

/** Who each character is, for the casting page's identity cards (docs/VOICE_CASTING.md). The
 *  personality belongs to the person, never to the accent (AGENTS.md §6). */
export interface CastBrief {
  name: string;
  role: string;
  age: string;
  accent: string;
  /** How they should sound. */
  voice: string;
}

export const CAST_BRIEFS: Record<string, CastBrief> = {
  gaz: {
    name: 'Gaz',
    role: 'Café owner: sarcastic, gruff, secretly fair',
    age: '50s',
    accent: 'General/broad Australian (Sydney)',
    voice: 'Low, dry, unhurried; deadpan comic timing; warmth under the sarcasm.',
  },
  dazza: {
    name: 'Dazza',
    role: 'Tradie regular, always late for site',
    age: '30s',
    accent: 'Broad Australian',
    voice: 'Fast, clipped, slangy, friendly; slight rasp.',
  },
  beryl: {
    name: 'Nan Beryl',
    role: 'Regular since 1987; chatty nan',
    age: '70s+',
    accent: 'Older Australian',
    voice: 'Slow, warm, a bit wavery; "love", "darl".',
  },
  karen: {
    name: 'Karen',
    role: 'Demanding, curt, precise',
    age: '40s',
    accent: 'General Australian',
    voice: 'Crisp, clipped consonants, controlled irritation; never shouting.',
  },
  priya: {
    name: 'Priya',
    role: 'Nurse after a night shift; polite, tired',
    age: 'Late 20s',
    accent: 'Indian English',
    voice: 'Soft, slightly slow, tired but clear.',
  },
  jiwoo: {
    name: 'Jiwoo',
    role: 'Working-holiday maker; cheerful',
    age: 'Early 20s',
    accent: 'Korean-accented English (fluent L2)',
    voice: 'Bright, quick; a few Korean words said naturally (아아, 감사합니다).',
  },
  mei: {
    name: 'Mei',
    role: 'Product manager on a call; brisk, confident',
    age: '30s',
    accent: 'Mandarin-accented English (fluent L2, professional)',
    voice: 'Quick, efficient, assured; not "cute", not halting.',
  },
};

/** Where a provider's voices can be heard before anything is bought, and what using them needs.
 *  The casting page links to these pages; it never embeds or stores their audio. */
export interface ProviderInfo {
  name: string;
  /** Official page with voice previews, or null when there's nothing to hear yet. */
  previewUrl: string | null;
  previewNeedsLogin: boolean;
  /** One line on licensing, details in docs/VOICE_PROVIDERS.md. */
  licence: string;
}

export const PROVIDER_INFO: Record<Provider, ProviderInfo> = {
  macos: {
    name: 'macOS system voice',
    previewUrl: null,
    previewNeedsLogin: false,
    licence: 'Personal, non-commercial use only: pipeline testing, never shipped.',
  },
  files: {
    name: 'Delivered recordings (actor or provider)',
    previewUrl: null,
    previewNeedsLogin: false,
    licence: 'Needs a signed buyout or written licence covering games, trailers and stores.',
  },
  azure: {
    name: 'Microsoft Azure AI Speech (neural TTS)',
    // A JavaScript app with a sign-in prompt: may need a (free) Microsoft login.
    previewUrl: 'https://speech.microsoft.com/portal/voicegallery',
    previewNeedsLogin: true,
    licence:
      'Commercial game use allowed (transparency note lists video games); Microsoft requires disclosing that voices are synthetic.',
  },
  google: {
    name: 'Google Cloud Text-to-Speech (Chirp 3 HD)',
    previewUrl: 'https://cloud.google.com/text-to-speech/docs/list-voices-and-types',
    previewNeedsLogin: false,
    licence:
      'Output is customer data under the Google Cloud terms; no disclosure rule found, but credit AI voices anyway.',
  },
};

/** One voice per speaker for the release pass (docs/TODO.md Phase 3; Edward, 2026-10-16: Google
 *  Cloud TTS, Gaz, Jiwoo and Mei recorded by actors, AU$20 cap). The TTS picks come from the
 *  auditioned candidates above and stand until the listen-through approves or re-casts them. */
export interface CastEntry {
  provenance: 'licensed_tts' | 'recorded';
  provider: 'google' | 'files';
  /** Google voice name, or the folder an actor's takes are delivered in. */
  voice: string;
  /** Google: the voice's language code (its name starts with it). */
  languageCode?: string;
  /** Google `speakingRate` (0.25–2; Chirp 3 HD takes pace, not pitch). Each line's own rate
   *  (order pace, slow repeats) multiplies it. */
  rate?: number;
  /** The terms the audio is used under: the provider's, or the actor's signed licence. Empty
   *  until it exists. */
  licence: string;
  /** What is still missing before these clips may ship, if anything. */
  pending?: string;
}

const GOOGLE_TERMS =
  'Google Cloud Text-to-Speech (Chirp 3 HD) output, used under the Google Cloud Platform Terms ' +
  'of Service: output is customer data, usable to power applications (cloud.google.com/terms, ' +
  'docs.cloud.google.com/text-to-speech/docs/basics; checked 2026-10-16). See ' +
  'docs/VOICE_PROVIDERS.md for the open question on the generative-AI service terms.';
const ACTOR_PENDING =
  'A signed buyout or written licence from the actor (docs/VOICE_CASTING.md licence checklist), ' +
  "delivered with the takes in source.json; until then their clips can't ship.";

const google = (voice: string, rate?: number): CastEntry => ({
  provenance: 'licensed_tts',
  provider: 'google',
  voice,
  languageCode: voice.split('-').slice(0, 2).join('-'),
  ...(rate === undefined ? {} : { rate }),
  licence: GOOGLE_TERMS,
});
const actor = (folder: string): CastEntry => ({
  provenance: 'recorded',
  provider: 'files',
  voice: folder,
  licence: '',
  pending: ACTOR_PENDING,
});

export const CAST: Record<string, CastEntry> = {
  gaz: actor('gaz-actor'),
  dazza: google('en-AU-Chirp3-HD-Fenrir', 1.1),
  beryl: google('en-AU-Chirp3-HD-Gacrux', 0.9),
  karen: google('en-AU-Chirp3-HD-Kore'),
  priya: google('en-IN-Chirp3-HD-Leda', 0.95),
  jiwoo: actor('jiwoo-actor'),
  mei: actor('mei-actor'),
};

/** What a licensed TTS pass may cost. Chirp 3 HD: US$30 per million characters (spaces count), the
 *  first million each month free (ignored here: estimates assume every character is paid). The
 *  exchange rate is rounded up on purpose; re-check both before a large render. */
export const TTS_BUDGET = {
  capAud: 20,
  usdPerMillionChars: 30,
  audPerUsd: 1.6,
  checkedOn: '2026-10-16',
} as const;
