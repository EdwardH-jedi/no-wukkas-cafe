// Browser speech synthesis: the FALLBACK voice, used only when a recorded clip is missing or fails
// to load (audio/manager.ts plays the clips). Hardened against the usual Web Speech traps:
//  - iOS only allows speech after a gesture → unlock() from the Start click;
//  - Chrome can drop an utterance spoken in the same tick as cancel() → speak on the next task;
//  - a paused engine stays paused → resume() before every line;
//  - an utterance that's garbage-collected mid-line goes silent → keep a reference;
//  - silence is invisible → a watchdog reports lines that never start.

export interface TtsStyle {
  pitch: number;
  rate: number;
  female: boolean;
  /** BCP-47 locale to prefer, e.g. 'en-IN'. */
  locale?: string;
  /** System voice names to prefer, best first. */
  prefer?: readonly string[];
  /** 0..1, the player's voice volume (browser speech can't go through the Web Audio buses). */
  volume?: number;
}

export interface Tts {
  readonly available: boolean;
  readonly speaking: boolean;
  unlock(): void;
  /** onFail fires if the engine never starts the line; onStarted when it does (the utterance's
   *  start event), once, and not for a line already replaced or stopped. */
  speak(
    text: string,
    style: TtsStyle,
    onFail?: (why: string) => void,
    onStarted?: () => void,
  ): void;
  stop(): void;
  pause(): void;
  resume(): void;
  /** Name of the voice the last line used (debug). */
  readonly lastVoice: string;
}

// Voice names by gender, for the voices the cast's locales ship with on macOS/iOS, Windows,
// Android and Chrome (en-AU, en-IN, ko-KR, zh-CN, ja-JP). Unlisted names count as unknown.
const MALE =
  /lee|gordon|\bmale\b|daniel|james|william|david|mark|george|ryan|arthur|oliver|aaron|fred|alex|tom|russell|rishi|aman|ravi|prabhat|kunal|injoon|hyunsu|otoya|hattori|ichiro|keita|kangkang|yunxi/i;
const FEMALE =
  /karen|catherine|female|zira|samantha|serena|sonia|natasha|hazel|susan|libby|moira|tessa|fiona|victoria|nicky|yuna|kate|tara|tingting|isha|lekha|veena|sangeeta|heera|neerja|heami|sunhi|kyoko|haruka|ayumi|nanami|sayaka|huihui|xiaoxiao|lili|hayley/i;

/** What the picker needs of a browser voice (SpeechSynthesisVoice has both). */
export interface VoiceLike {
  name: string;
  lang: string;
}

const normLang = (l: string): string => (l || '').replace(/_/g, '-').toLowerCase();

/**
 * The browser voice for a speaker whose recording is missing, so their accent survives the
 * fallback: a named voice from their own list first (best first); else a voice in their locale
 * (`ja-JP`), then in their language (`ja`, for a locale that isn't English), then Australian,
 * British and any English, in that order. Within a pool the speaker's gender wins, then a voice
 * of unknown gender, then the other. Null when the browser has no voice at all.
 */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], style: TtsStyle): V | null {
  for (const name of style.prefer ?? []) {
    const v = voices.find((x) => x.name === name || x.name.startsWith(`${name} `));
    if (v) return v;
  }
  const own = style.locale ? normLang(style.locale) : null;
  const lang = own?.split('-')[0];
  const langs = [
    ...(own ? [own] : []),
    ...(lang && lang !== 'en' ? [lang] : []),
    'en-au',
    'en-gb',
    'en',
  ];
  const same = style.female ? FEMALE : MALE;
  const other = style.female ? MALE : FEMALE;
  for (const l of langs) {
    const pool = voices.filter((v) => {
      const vl = normLang(v.lang);
      return vl === l || vl.startsWith(`${l}-`);
    });
    if (pool.length)
      return (
        pool.find((v) => same.test(v.name)) ??
        pool.find((v) => !other.test(v.name)) ??
        pool[0] ??
        null
      );
  }
  return null;
}

/** Text tweaks so engines don't read punctuation literally. Subtitles keep the original. */
export const ttsText = (text: string): string =>
  text
    .replace(/tss-tss/gi, 'tss, tss')
    .replace(/(\d+)\s*[–-]\s*(\d+)/g, '$1 to $2')
    .replace(/\s*°C/g, ' degrees')
    .replace(/[—–]/g, ', ');

export function createTts(): Tts {
  const synth: SpeechSynthesis | null =
    typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  let voices: SpeechSynthesisVoice[] = [];
  const load = (): void => {
    try {
      voices = synth?.getVoices() ?? [];
    } catch {
      voices = [];
    }
  };
  load();
  if (synth) synth.addEventListener?.('voiceschanged', load);

  let current: SpeechSynthesisUtterance | null = null; // GC guard
  let gen = 0;
  let started = false;
  let lastVoice = '';

  const pick = (style: TtsStyle): SpeechSynthesisVoice | null => pickVoice(voices, style);

  return {
    get available() {
      return synth !== null;
    },
    get speaking() {
      return started && current !== null;
    },
    get lastVoice() {
      return lastVoice;
    },
    unlock() {
      // iOS only lets speech start from a user gesture: say nothing, quietly, right now.
      if (!synth) return;
      try {
        synth.resume();
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        synth.speak(u);
      } catch {
        /* optional */
      }
    },
    speak(text, style, onFail, onStarted) {
      if (!synth) {
        onFail?.('This browser has no speech synthesis.');
        return;
      }
      const my = ++gen;
      try {
        synth.resume();
        if (synth.speaking || synth.pending) synth.cancel();
      } catch {
        /* keep going */
      }
      started = false;
      current = null;
      if (voices.length === 0) load();
      // Next task, not this one: Chrome drops an utterance queued in the same tick as cancel().
      // Cosmetic timer (AGENTS.md §4.3): speech is presentation, the game clock owns the flow.
      setTimeout(() => {
        if (my !== gen) return;
        try {
          const u = new SpeechSynthesisUtterance(ttsText(text));
          const voice = pick(style);
          if (voice) {
            u.voice = voice;
            u.lang = voice.lang;
          } else u.lang = style.locale ?? 'en-AU';
          lastVoice = voice?.name ?? `(default ${u.lang})`;
          u.pitch = style.pitch;
          u.rate = style.rate;
          u.volume = Math.max(0, Math.min(1, style.volume ?? 1));
          u.onstart = () => {
            if (my !== gen || started) return;
            started = true;
            onStarted?.();
          };
          u.onend = () => {
            if (my === gen) current = null;
          };
          u.onerror = (e) => {
            if (my !== gen) return;
            current = null;
            if (e.error !== 'canceled' && e.error !== 'interrupted')
              onFail?.(`Browser speech error: ${e.error}`);
          };
          current = u;
          synth.speak(u);
          setTimeout(() => {
            if (my === gen && !started && current === u)
              onFail?.(
                voices.length ? 'Browser speech did not start.' : 'No speech voices installed.',
              );
          }, 2500);
        } catch (e) {
          onFail?.(`Browser speech failed: ${(e as Error).message}`);
        }
      }, 30);
    },
    stop() {
      gen++;
      current = null;
      started = false;
      try {
        synth?.cancel();
      } catch {
        /* ignore */
      }
    },
    pause() {
      try {
        synth?.pause();
      } catch {
        /* ignore */
      }
    },
    resume() {
      try {
        synth?.resume();
      } catch {
        /* ignore */
      }
    },
  };
}
