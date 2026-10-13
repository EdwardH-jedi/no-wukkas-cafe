# Voice providers and actors: research for casting

**Checked 2026-10-14** from public pages only: no sign-ups, no paid API calls, no audio
downloaded. Prices are USD unless marked AU$. **[V]** = verified on the provider's own page that
day; **[U]** = unverified, secondary source, or inference. Re-check everything before spending:
catalogues, prices and terms change. **Not legal advice**: have a lawyer read the licence terms
before anything ships.

Companion to `docs/VOICE_CASTING.md` (briefs, scoring, licence checklist). Candidates from this
research are listed in `src/data/voice/casting.ts` and appear on the casting page
(`/dev/casting.html`).

## Summary

- **No provider documents Korean- or Mandarin-accented English as a voice.** Multilingual ko-KR /
  zh-CN voices can read English, but nothing says the accent carries over; prompt-steered tools
  (OpenAI gpt-4o-mini-tts, Google Gemini-TTS preview, ElevenLabs Voice Design) claim accent
  control. Either way it's a caricature risk (AGENTS.md §6). **Recommendation unchanged: native
  Korean and Mandarin speakers for Jiwoo and Mei**, or at minimum native-speaker review of any AI
  output before it ships.
- **Australian male voices are thin.** Azure's HD en-AU voices are all female, so Gaz and Dazza
  would use the older standard neural tier (Duncan, Ken, Neil, Darren, Tim, William) [V]. Polly's
  only Australian male, Russell, is standard engine only [V].
- **Google Cloud TTS has the widest en-AU range and the only previews you can hear without a
  login**: 30 Chirp 3 HD personas each for en-AU and en-IN, with a sample per voice on the
  voice-list page [V].
- **Price isn't the constraint.** One full pass (~30,000 characters) is under US$1 on Azure,
  Google, Polly or OpenAI, and their free tiers cover an audition round. Human actors are the real
  cost: roughly **AU$6,000–15,000** for all seven [U].
- **Disclosure:** Microsoft and OpenAI require telling players the voices are AI-generated [V].
- **Voices can disappear:** ElevenLabs' default voices expire 2026-12-31 and library voices can be
  withdrawn on 30 days' to 2 years' notice (made audio stays usable); PlayHT shut down on
  2025-12-31 [U]. Our rendered clips and manifest stay the source of truth.
- **No open model has an Australian voice.** XTTS-v2 and F5-TTS forbid commercial use [V].

## Providers

| | Azure AI Speech | Google Cloud TTS | Amazon Polly | ElevenLabs | OpenAI TTS |
|---|---|---|---|---|---|
| **en-AU** | 15 standard neural: 7 male (William, WilliamMultilingual, Darren, Duncan, Ken, Neil, Tim), 8 female; HD voices all female (Isla:MAI-Voice-2 in preview) [V] | 30 Chirp 3 HD personas, plus Neural2 A–D, WaveNet A–D [V] | Olivia (neural/generative); Nicole and Russell standard only [V] | "Australian" accent category in the Voice Library [V]; voice names need a login [U] | No locale voices; accent by prompt [V] |
| **en-IN** | 14 standard neural + 6 DragonHD (e.g. Aarti, Neerja) [V] | 30 Chirp 3 HD personas, Neural2, WaveNet [V] | Kajal (neural/generative); Aditi, Raveena standard [V] | "Indian" accent category [V] | Accent by prompt [V] |
| **Korean / Mandarin-accented English** | Side effect of ko-KR / zh-CN multilingual voices at best; undocumented [V/U] | Gemini-TTS "produce accents when requested" (preview), but the Gemini API page advises against permanent accent changes [V] | None [V] | Voice Design prompt sets accent [V] | Prompted accent [V] |
| **Price per 1M characters** | Neural $15, HD $22 (Azure retail prices API) [V] | Chirp 3 HD $30, Neural2 $16, WaveNet $4 [V] | Neural $16, Generative $30 [V] | ~$80 at API rates; plans from $6/mo (Starter) or $22 (Creator) [V]; page conflict on Starter credits | tts-1 $15, tts-1-hd $30 [V] |
| **Free tier** | 0.5M neural chars/month (F0) [V] | 1M Chirp 3 HD / month, billing must be enabled [V] | 1M neural for 12 months (check: AWS changed new-account free tiers in 2025) [U] | 10K credits, **no commercial use, credit required** [V] | None [V] |
| **Commercial game use** | Yes: transparency note lists video games [V] | Yes: output is customer data [V] | Yes: no restriction on reuse of output [V] | Paid plans yes, except "Beta Services" output [V] | Yes, under usage policies [V] |
| **Disclosure** | **Required** (AI Code of Conduct) [V] | None found; you're responsible "under applicable law" [V] | None found [V] | Free plan: attribution [V] | **Required** [V] |
| **Previews** | Voice Gallery (speech.microsoft.com/portal/voicegallery), JS app with sign-in prompt [U] | **No login**: cloud.google.com/text-to-speech/docs/list-voices-and-types [V] | AWS console, login [U] | Sign-up needed to play [V] | Not checked [U] |
| **Key risk** | No male HD en-AU voice | Accent steering only in preview | Can't cast two modern Australian men | Voices expire or are withdrawn | 13 generic voices: accents, not distinct people |

Others, briefly: **Cartesia** (Pro $5/mo; Australian accent unverified) [V/U]; **WellSaid**
(mentions Australian accents; billed per minute, Pro $49/mo) [V]; **Hume, Murf, LOVO** pricing
not verifiable [U]; **PlayHT** closed [U].

**Open models:** Kokoro-82M (Apache-2.0, no en-AU or Korean voice), Piper (no en_AU), XTTS-v2
(CPML, non-commercial), F5-TTS (CC-BY-NC), Dia / Sesame CSM / Chatterbox (no fixed voices: need a
reference recording, i.e. a consenting paid voice donor, which is human casting anyway) [V].

## Candidates per character

Google's one-word persona descriptions come from its Gemini voice list; that they describe the
en-AU and en-IN Chirp 3 HD variants is an assumption [U]. No provider states a voice's age.

| Character | TTS candidates to hear first | Human? |
|---|---|---|
| **Gaz** (296+ lines) | Google en-AU-Chirp3-HD-Algenib ("Gravelly"); Azure en-AU-DuncanNeural / WilliamNeural | **Preferred**: comic timing carries the game |
| **Dazza** | Google en-AU-Chirp3-HD-Fenrir ("Excitable"); Azure en-AU-NeilNeural / KenNeural | If TTS sounds flat |
| **Beryl** | Google en-AU-Chirp3-HD-Gacrux ("Mature"); Azure en-AU-ElsieNeural. **No provider has an elderly voice** | Recommended |
| **Karen** | Google en-AU-Chirp3-HD-Kore ("Firm"); Azure en-AU-NatashaNeural / JoanneNeural; Azure Isla (preview, has styles) | If TTS sounds flat |
| **Priya** | Azure en-IN-NeerjaNeural / AnanyaNeural (or DragonHD Aarti); Google en-IN-Chirp3-HD-Leda ("Youthful") | If TTS sounds flat |
| **Jiwoo** | None recommended. Azure ko-KR multilingual voices reading English are undocumented for accent | **Native Korean speaker** |
| **Mei** | None recommended. Azure zh-CN multilingual voices as for Jiwoo | **Native Mandarin speaker** |

**Distinctness:** on Azure, Gaz and Dazza would come from the same standard-tier family; Google's
personas give the widest set of distinct Australian voices.

## Human voice actors

- **Where:** Voices.com, Voice123, Backstage, Fiverr Pro, Bodalgo (global); Casting Networks,
  Showcast, StarNow (Australia); agencies such as Saxton (has a video-games page) [U]. For Jiwoo
  and Mei, ask specifically for native speakers with fluent accented-English reels.
- **Rates:** MEAA's voice-over rate card needs a member login and has no video-games category.
  KAMvoices (says it uses MEAA's 1 July 2025 rates): AU$485 per hour non-broadcast, +AU$220 per
  track for character or accent voices, plus 12% super [V on the agency page]. GVAA guide (via a
  reproduction): games US$200–350/hr, 2–4 hr minimum, full buyout [U].
- **Budget:** Gaz 2–3 hours, the other six about an hour each: ~AU$6,000–6,700 in session fees,
  realistically **AU$6k–15k** with buyout, studio and direction [U].
- **Contract:** buyout covering in-game use, trailers and marketing, perpetual, worldwide, all
  platforms; an explicit no-AI-training / no-cloning clause (or a separately paid one); pick-ups
  and retakes; credit.

## Cost estimates

| | Audition round (~1,400–4,200 chars) | Full pass (~30,000 chars) |
|---|---|---|
| Azure | $0 on F0 (list $0.04–0.09) | $0.45 neural / $0.66 HD; $0 on F0 |
| Google | $0 on free tier (list $0.13) | $0.90 Chirp 3 HD; $0 on free tier |
| Polly | $0 first 12 months | $0.48 neural / $0.90 generative |
| ElevenLabs | Free credits can't be used commercially | ~$2.40 at API rates; a paid plan is needed to ship |
| OpenAI | ~$0.13 | $0.45–0.90 |
| Human actors | Agency demo reels (free) | ~AU$6k–15k |

Retakes multiply TTS costs 3–5×, which is still small.

## Legal and risk notes (for a lawyer to check)

- **Australia** has no statutory personality or voice right; soundalikes are pursued through
  passing off, misleading conduct (ACL s 18) or copyright in a specific recording. A 2025 private
  member's bill on deepfaked faces and voices has unknown status [U].
- **Provider risk:** record provider, voice ID, model, plan and date for every clip in the
  manifest's `source` and `docs/AUDIO_PROVENANCE.md`.
- **Disclosure:** Microsoft and OpenAI require it; a credits line and a store-page note are the
  minimum. Platform and EU AI Act rules may add more [U].
- **Representation:** prompted accents are a caricature risk. Native-speaker review, whatever the
  source.

## Sources (checked 2026-10-14)

Microsoft: learn.microsoft.com Speech language support (TTS) and SSML voice pages, Azure retail
prices API, Azure Speech pricing page, TTS transparency note, AI Code of Conduct. Google:
cloud.google.com/text-to-speech/docs/list-voices-and-types, /pricing, /docs/gemini-tts;
ai.google.dev/gemini-api/docs/speech-generation; Google Cloud service terms. Amazon:
docs.aws.amazon.com/polly available voices, aws.amazon.com/polly/pricing and FAQs, AWS service
terms. ElevenLabs: /pricing, /pricing/api, models and voices docs, voice library, publishing and
notice-period help pages, Voice Library Addendum. OpenAI: developers.openai.com TTS guide and
pricing. Others: cartesia.ai/pricing, wellsaid.io/pricing, hume.ai/pricing, resemble.ai/pricing,
Hugging Face model cards (Kokoro-82M, piper-voices, XTTS-v2, F5-TTS, Dia-1.6B, orpheus-3b,
csm-1b, chatterbox), kamvoices.com/rates.php, meaa.org/download (login), GVAA rate guide (gated,
via a reproduction), saxton.com.au, MinterEllison and Mills Oakley articles on voices in
Australian law.
